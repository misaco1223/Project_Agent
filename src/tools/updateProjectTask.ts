/*type ProjectTask = {
    id: number;
    name: string;
    progress: number;
    deadline: string;
    status: string;
  };
  
  const tasks: ProjectTask[] = [
    {
      id: 1,
      name: "API開発",
      progress: 50,
      deadline: "2026-08-10",
      status: "in_progress",
    },
    {
      id: 2,
      name: "画面開発",
      progress: 80,
      deadline: "2026-08-12",
      status: "in_progress",
    },
    {
      id: 3,
      name: "テスト",
      progress: 20,
      deadline: "2026-08-15",
      status: "not_started",
    },
  ];
  
  export async function updateProjectTask(
    taskId: number,
    progress: number,
  ): Promise<ProjectTask> {
    const task = tasks.find((task) => task.id === taskId);
  
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
  
    if (progress < 0 || progress > 100) {
      throw new Error("Progress must be between 0 and 100");
    }
  
    task.progress = progress;
  
    if (progress === 100) {
      task.status = "completed";
    } else if (progress > 0) {
      task.status = "in_progress";
    } else {
      task.status = "not_started";
    }
  
    return task;
  }*/


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
    throw new Error("Progress must be an integer between 0 and 100");
  }

  // project.jsonを読み込む
  const fileUrl = new URL("../../data/project.json", import.meta.url);
  const file = await readFile(fileUrl, "utf-8");
  const projectData: ProjectData = JSON.parse(file);

  // 更新対象のタスクを探す
  const task = projectData.tasks.find((task) => task.id === taskId);

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
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
