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

/**
 * AI Agentを実行する
 *
 * ユーザーからの入力をLLMに渡し、
 * LLMが必要と判断したToolを実行する。
 *
 * Toolの実行結果をLLMへ返し、
 * 追加のTool実行が必要なくなるまで処理を繰り返す。
 */

export async function runAgent(
  client: OpenAI,
  input: string,
  previousResponseId?: string,
) {
  // .envのAPIキーがない場合
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEYが設定されていません。.envファイルを確認してください。",
    );
  }

  let response: OpenAI.Responses.Response;

  // --------------------------------------------------
  // 最初のLLM呼び出し
  // --------------------------------------------------
  //
  // ユーザーの入力とAgentのルールをLLMに渡し、
  // 必要に応じてToolを呼び出すようにする。
  //
  // previousResponseIdがある場合は、
  // 直前のLLMとの会話を引き継ぐ。
  //
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

    // APIレスポンスが想定形式でない場合
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

  // --------------------------------------------------
  // AgentがToolから取得した情報を保持する
  // --------------------------------------------------
  //
  // 複数のToolをまたいで情報を利用できるよう、
  // Agent Loopの実行中は取得したデータを保持する。
  //
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

  // --------------------------------------------------
  // Agent Loop
  // --------------------------------------------------
  //
  // LLMがToolを必要と判断している間は、
  // Toolを実行 → 結果をLLMへ返す、という処理を繰り返す。
  //
  while (true) {
    loopCount++;

    // Agent LoopがLLMの最大実行回数を超えた場合
    if (loopCount > MAX_LOOP_COUNT) {
      throw new Error(
        `Agent Loopが最大実行回数(${MAX_LOOP_COUNT}回)を超えました。処理を終了します。`,
      );
    }

    // APIレスポンスが想定形式でない場合
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

    // 複数のTool Callingが返された場合に備えて、
    // それぞれのToolを実行して結果をまとめる。
    const toolOutputs = [];

    for (const toolCall of toolCalls) {
      let result: unknown;

      try {
        // --------------------------------------------------
        // Toolの実行
        // --------------------------------------------------
        //
        // LLMが指定したTool名を確認し、
        // 対応するTypeScriptの関数を実行する。
        //
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

        // プロジェクトのタスク情報を取得する
        if (toolCall.name === "get_project_tasks") {
          projectData = await getProjectTasks();
          result = projectData;

        // GitHub Issueを取得する
        } else if (toolCall.name === "get_github_issues") {
          githubIssues = await getGithubIssues();

          // GitHubにIssueが存在しない場合
          if (Array.isArray(githubIssues) && githubIssues.length === 0) {
            result = {
              issues: [],
              message: "GitHub Issueは現在存在しません。",
            };
          } else {
            result = githubIssues;
          }

        // 現在日時を取得する
        } else if (toolCall.name === "get_current_datetime") {
          currentDateTime = getCurrentDateTime();
          result = currentDateTime;

        // スケジュールリスクを分析する
        } else if (toolCall.name === "analyze_schedule_risk") {
          // --------------------------------------------------
          // リスク分析に必要な情報を準備
          // --------------------------------------------------
          //
          // 必要な情報がまだ取得されていない場合は、
          // ここで取得する。
          //
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

          // --------------------------------------------------
          // スケジュールリスクの計算
          // --------------------------------------------------
          //
          // リスク判定はLLMに任せず、
          // TypeScript側の関数で決定的に計算する。
          //
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

        // タスクの進捗を更新する
        } else if (toolCall.name === "update_project_task") {
          // Toolのargumentsが想定形式でない場合
          let args: {
            taskId: number;
            progress: number;
          };

          // LLMから渡された引数をJSONとして解析する
          try {
            args = JSON.parse(toolCall.arguments);
          } catch {
            throw new Error(
              "update_project_taskのargumentsをJSONとして解析できませんでした。",
            );
          }

          // taskIdとprogressが数値であることを確認する
          if (
            typeof args.taskId !== "number" ||
            typeof args.progress !== "number"
          ) {
            throw new Error(
              "update_project_taskの引数が不正です。taskIdとprogressには数値が必要です。",
            );
          }

          // progressが許容範囲内であることを確認する
          if (args.progress < 0 || args.progress > 100) {
            throw new Error(
              "progressは0〜100の範囲で指定してください。",
            );
          }

          // 更新対象のタスク情報がまだ取得されていない場合は取得する
          if (!projectData) {
            projectData = await getProjectTasks();
          }

          // TypeScript側の更新処理を実行する
          result = await updateProjectTask(
            args.taskId,
            args.progress,
          );
        }

        // --------------------------------------------------
        // Toolの実行結果をLLMへ返すための形式に変換
        // --------------------------------------------------
        //
        // Toolの実行結果をJSON文字列としてLLMへ返す。
        toolOutputs.push({
          type: "function_call_output" as const,
          call_id: toolCall.call_id,
          output: JSON.stringify(result),
        });
      } catch (error) {
        // GitHub API呼び出しの失敗
        // Tool実行時のエラー
        // 想定外Tool
        //
        // ToolのエラーでAgent全体を即終了させず、
        // エラー内容をLLMへ返してAgentに判断させる。
        const errorMessage = getErrorMessage(error);

        console.error(
          `Tool "${toolCall.name}" の実行に失敗しました:`,
          errorMessage,
        );

        // エラーもToolの実行結果としてLLMへ返す
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

    // --------------------------------------------------
    // Tool実行結果をLLMへ返す
    // --------------------------------------------------
    //
    // Toolの結果をLLMに渡し、
    // 追加のTool実行が必要か、最終回答を返せるかを
    // LLMに判断させる。
    //
    try {
      response = await client.responses.create({
        model: "gpt-5-mini",
        previous_response_id: response.id,
        input: toolOutputs,
      });

      // APIレスポンスが想定形式でない場合
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
