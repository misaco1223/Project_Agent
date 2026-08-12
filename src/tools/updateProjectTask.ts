import { readFile, writeFile } from "node:fs/promises";

type ProjectTask = {
  id: number;
  name: string;
  progress: number;
  deadline: string;
  status: string;
};

type ProjectData = {
  projectName: string;
  tasks: ProjectTask[];
};

export async function updateProjectTask(
  taskId: number,
  progress: number,
): Promise<ProjectTask> {
  // progressの入力値をチェック
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new Error("進捗は0から100までの整数値にしてください。");
  }

  // project.jsonを読み込む
  const fileUrl = new URL("../../data/project.json", import.meta.url);
  const file = await readFile(fileUrl, "utf-8");
  const projectData: ProjectData = JSON.parse(file);

  // 更新対象のタスクを探す
  const task = projectData.tasks.find((task) => task.id === taskId);

  if (!task) {
    throw new Error(`タスクID ${taskId} は存在しません。`);
  }

  // progressだけ更新する
  task.progress = progress;

  // project.jsonを書き込む
  await writeFile(
    fileUrl,
    JSON.stringify(projectData, null, 2),
    "utf-8",
  );

  // 更新後のタスクを返す
  return task;
}
