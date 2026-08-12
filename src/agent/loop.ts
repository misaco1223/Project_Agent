import OpenAI from "openai";
import { systemPrompt } from "./systemPrompt.js";
import { getProjectTasks } from "../tools/getProjectTasks.js";
import { getGithubIssues } from "../tools/getGithubIssues.js";
import { updateProjectTask } from "../tools/updateProjectTask.js";
import { analyzeScheduleRisk } from "../domain/analyzeScheduleRisk.js";
import { getCurrentDateTime } from "../tools/getCurrentDateTime.js";

type ProjectData = Awaited<ReturnType<typeof getProjectTasks>>;
type GithubIssues = Awaited<ReturnType<typeof getGithubIssues>>;
type Task = ProjectData["tasks"][number];

// Agent Loopの最大実行回数
const MAX_LOOP_COUNT = 10;

/**
 * OpenAI APIのレスポンスが想定した形式か確認する
 */
function isValidResponse(response: OpenAI.Responses.Response): boolean {
  return (
    !!response &&
    typeof response.id === "string" &&
    Array.isArray(response.output)
  );
}

/**
 * エラーを文字列として安全に取得する
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function runAgent(
  client: OpenAI,
  input: string,
  previousResponseId?: string,
) {
  // 7. .envのAPIキーがない場合
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEYが設定されていません。.envファイルを確認してください。",
    );
  }

  let response: OpenAI.Responses.Response;

  // 1. OpenAI API呼び出しの失敗
  try {
    response = await client.responses.create({
      model: "gpt-5-mini",
      input,
      instructions: systemPrompt,
      tools: [
        {
          type: "function",
          name: "get_project_tasks",
          description:
            "プロジェクトのタスク一覧を取得します。進捗確認や遅延リスク分析に必要な場合に使用してください。",
          strict: true,
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "get_github_issues",
          description:
            "GitHubのIssue一覧を取得します。プロジェクトの進捗確認や遅延リスク分析に必要な場合に使用してください。",
          strict: true,
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "get_current_datetime",
          description:
            "現在の日本時間の日付を取得します。期限やスケジュールリスクを判断する場合は必ず使用してください。",
          strict: true,
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "analyze_schedule_risk",
          description:
            "プロジェクトタスクの進捗と期限からスケジュール遅延リスクを分析します。GitHub Issue情報も合わせてリスク判断の材料を返します。",
          strict: true,
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "update_project_task",
          description:
            "プロジェクトタスクの進捗を更新します。ユーザーが更新内容を確認して承認した後にのみ使用してください。更新依頼を受けただけの段階では使用しないでください。",
          strict: true,
          parameters: {
            type: "object",
            properties: {
              taskId: {
                type: "number",
                description: "更新するタスクのID",
              },
              progress: {
                type: "number",
                description: "更新後の進捗率。0〜100の整数",
              },
            },
            required: ["taskId", "progress"],
            additionalProperties: false,
          },
        },
      ],
      ...(previousResponseId
        ? { previous_response_id: previousResponseId }
        : {}),
    });

    // 6. APIレスポンスが想定形式でない場合
    if (!isValidResponse(response)) {
      throw new Error(
        "OpenAI APIから想定外のレスポンスが返されました。",
      );
    }
  } catch (error) {
    throw new Error(
      `OpenAI APIの呼び出しに失敗しました: ${getErrorMessage(error)}`,
    );
  }

  // Agentが取得した情報を保持する
  let projectData: ProjectData | undefined;
  let githubIssues: GithubIssues | undefined;

  let currentDateTime:
    | ReturnType<typeof getCurrentDateTime>
    | undefined;

  // リスク分析結果を保持する
  let scheduleRisks:
    | ReturnType<typeof analyzeScheduleRisk>[]
    | undefined;

  let loopCount = 0;

  while (true) {
    // 8. Agent Loopが異常終了・無限ループする場合
    loopCount++;

    if (loopCount > MAX_LOOP_COUNT) {
      throw new Error(
        `Agent Loopが最大実行回数(${MAX_LOOP_COUNT}回)を超えました。処理を終了します。`,
      );
    }

    // 6. APIレスポンスが想定形式でない場合
    if (!response || !Array.isArray(response.output)) {
      throw new Error(
        "Agentから想定外のレスポンスが返されました。",
      );
    }

    const toolCalls = response.output.filter(
      (item) => item.type === "function_call",
    );

    if (toolCalls.length === 0) {
      return {
        text: response.output_text,
        responseId: response.id,
      };
    }

    const toolOutputs = [];

    for (const toolCall of toolCalls) {
      let result: unknown;

      try {
        // 3. Tool Callingで想定外のToolが指定された場合
        if (
          ![
            "get_project_tasks",
            "get_github_issues",
            "get_current_datetime",
            "analyze_schedule_risk",
            "update_project_task",
          ].includes(toolCall.name)
        ) {
          throw new Error(`Unknown tool: ${toolCall.name}`);
        }

        if (toolCall.name === "get_project_tasks") {
          projectData = await getProjectTasks();
          result = projectData;

        } else if (toolCall.name === "get_github_issues") {
          githubIssues = await getGithubIssues();

          // 5. GitHubにIssueが存在しない場合
          if (Array.isArray(githubIssues) && githubIssues.length === 0) {
            result = {
              issues: [],
              message: "GitHub Issueは現在存在しません。",
            };
          } else {
            result = githubIssues;
          }

        } else if (toolCall.name === "get_current_datetime") {
          currentDateTime = getCurrentDateTime();
          result = currentDateTime;

        } else if (toolCall.name === "analyze_schedule_risk") {
          if (!projectData) {
            projectData = await getProjectTasks();
          }

          if (!githubIssues) {
            githubIssues = await getGithubIssues();
          }

          if (!currentDateTime) {
            currentDateTime = getCurrentDateTime();
          }

          // Toolから取得した現在日時だけを使用する
          const today = new Date(
            `${currentDateTime.date}T00:00:00+09:00`,
          );

          // TypeScript側でリスクを計算する
          scheduleRisks = projectData.tasks.map(
            (task: Task) => analyzeScheduleRisk(task, today),
          );

          // TypeScriptによるリスク判定結果は変更せず、
          // GitHub Issue情報とともにLLMへ渡す
          result = {
            scheduleRisks,
            githubIssues,
            currentDateTime,
          };

        } else if (toolCall.name === "update_project_task") {
          // 6. Toolのargumentsが想定形式でない場合
          let args: {
            taskId: number;
            progress: number;
          };

          try {
            args = JSON.parse(toolCall.arguments);
          } catch {
            throw new Error(
              "update_project_taskのargumentsをJSONとして解析できませんでした。",
            );
          }

          if (
            typeof args.taskId !== "number" ||
            typeof args.progress !== "number"
          ) {
            throw new Error(
              "update_project_taskの引数が不正です。taskIdとprogressには数値が必要です。",
            );
          }

          if (args.progress < 0 || args.progress > 100) {
            throw new Error(
              "progressは0〜100の範囲で指定してください。",
            );
          }

          if (!projectData) {
            projectData = await getProjectTasks();
          }

          result = await updateProjectTask(
            args.taskId,
            args.progress,
          );
        }

        toolOutputs.push({
          type: "function_call_output" as const,
          call_id: toolCall.call_id,
          output: JSON.stringify(result),
        });
      } catch (error) {
        // 2. GitHub API呼び出しの失敗
        // 4. Tool実行時のエラー
        // 3. 想定外Tool
        //
        // ToolのエラーでAgent全体を即終了させず、
        // エラー内容をLLMへ返してAgentに判断させる。
        const errorMessage = getErrorMessage(error);

        console.error(
          `Tool "${toolCall.name}" の実行に失敗しました:`,
          errorMessage,
        );

        toolOutputs.push({
          type: "function_call_output" as const,
          call_id: toolCall.call_id,
          output: JSON.stringify({
            error: true,
            tool: toolCall.name,
            message: errorMessage,
          }),
        });
      }
    }

    // 1. OpenAI API呼び出しの失敗
    try {
      response = await client.responses.create({
        model: "gpt-5-mini",
        previous_response_id: response.id,
        input: toolOutputs,
      });

      // 6. APIレスポンスが想定形式でない場合
      if (!isValidResponse(response)) {
        throw new Error(
          "OpenAI APIから想定外のレスポンスが返されました。",
        );
      }
    } catch (error) {
      throw new Error(
        `OpenAI APIの呼び出しに失敗しました: ${getErrorMessage(error)}`,
      );
    }
  }
}
