import OpenAI from "openai";
import { systemPrompt } from "./systemPrompt.js";
import { getProjectTasks } from "../tools/getProjectTasks.js";
import { getGithubIssues } from "../tools/getGithubIssues.js";
import { updateProjectTask } from "../tools/updateProjectTask.js";
import { analyzeScheduleRisk } from "../domain/analyzeScheduleRisk.js";

type ProjectData = Awaited<ReturnType<typeof getProjectTasks>>;
type GithubIssues = Awaited<ReturnType<typeof getGithubIssues>>;
type Task = ProjectData["tasks"][number];

export async function runAgent(
  client: OpenAI,
  input: string,
  previousResponseId?: string,
) {
  let response = await client.responses.create({
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

  // Agentが取得した情報を保持する
  let projectData: ProjectData | undefined;
  let githubIssues: GithubIssues | undefined;

  // リスク分析結果を保持する
  let scheduleRisks: ReturnType<typeof analyzeScheduleRisk>[] | undefined;

  while (true) {
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
      //console.log("Tool Call:", toolCall.name);
      //console.log("Arguments:", toolCall.arguments);

      let result: unknown;

      if (toolCall.name === "get_project_tasks") {
        projectData = await getProjectTasks();
        result = projectData;

      } else if (toolCall.name === "get_github_issues") {
        githubIssues = await getGithubIssues();
        result = githubIssues;

      } else if (toolCall.name === "analyze_schedule_risk") {
        // タスク情報がなければ取得
        if (!projectData) {
          projectData = await getProjectTasks();
        }

        // GitHub Issue情報がなければ取得
        if (!githubIssues) {
          githubIssues = await getGithubIssues();
        }

        // TypeScriptでスケジュールリスクを計算
        scheduleRisks = projectData.tasks.map(
          (task: Task) => analyzeScheduleRisk(task),
        );

        // TypeScriptによる計算結果とGitHub Issueを
        // LLMへ渡して総合判断させる
        result = {
          scheduleRisks,
          githubIssues,
        };

      } else if (toolCall.name === "update_project_task") {
        const args = JSON.parse(toolCall.arguments);

        // 現在のタスク情報を確認
        if (!projectData) {
          projectData = await getProjectTasks();
        }

        result = await updateProjectTask(
          args.taskId,
          args.progress,
        );

      } else {
        throw new Error(`Unknown tool: ${toolCall.name}`);
      }

      console.log("Tool Result:", result);

      toolOutputs.push({
        type: "function_call_output" as const,
        call_id: toolCall.call_id,
        output: JSON.stringify(result),
      });
    }

    response = await client.responses.create({
      model: "gpt-5-mini",
      previous_response_id: response.id,
      input: toolOutputs,
    });
  }
}
