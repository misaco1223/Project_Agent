export type ScheduleRisk = "high" | "medium" | "low";

export interface TaskForRiskAnalysis {
  id: number;
  name: string;
  progress: number;
  deadline: string;
}

export interface ScheduleRiskResult {
  taskId: number;
  taskName: string;
  progress: number;
  deadline: string;
  remainingDays: number;
  remainingProgress: number;
  requiredProgressPerDay: number;
  risk: ScheduleRisk;
}

export function analyzeScheduleRisk(
  task: TaskForRiskAnalysis,
  today: Date = new Date(),
): ScheduleRiskResult {
  const deadline = new Date(`${task.deadline}T23:59:59`);

  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  const remainingDays = Math.ceil(
    (deadline.getTime() - today.getTime()) / millisecondsPerDay,
  );

  const remainingProgress = Math.max(0, 100 - task.progress);

  // すでに完了しているタスクはリスクなし
  if (task.progress >= 100) {
    return {
      taskId: task.id,
      taskName: task.name,
      progress: task.progress,
      deadline: task.deadline,
      remainingDays: Math.max(0, remainingDays),
      remainingProgress: 0,
      requiredProgressPerDay: 0,
      risk: "low",
    };
  }

  // 期限切れ
  if (remainingDays < 0) {
    return {
      taskId: task.id,
      taskName: task.name,
      progress: task.progress,
      deadline: task.deadline,
      remainingDays: 0,
      remainingProgress,
      requiredProgressPerDay: 0,
      risk: "high",
    };
  }

  // 今日が期限で、まだ完了していない
  if (remainingDays === 0) {
    return {
      taskId: task.id,
      taskName: task.name,
      progress: task.progress,
      deadline: task.deadline,
      remainingDays: 0,
      remainingProgress,
      requiredProgressPerDay: remainingProgress,
      risk: "high",
    };
  }

  // 期限までに必要な1日あたりの進捗率
  const requiredProgressPerDay =
    remainingProgress / remainingDays;

  let risk: ScheduleRisk;

  if (requiredProgressPerDay >= 25) {
    risk = "high";
  } else if (requiredProgressPerDay >= 10) {
    risk = "medium";
  } else {
    risk = "low";
  }

  return {
    taskId: task.id,
    taskName: task.name,
    progress: task.progress,
    deadline: task.deadline,
    remainingDays,
    remainingProgress,
    requiredProgressPerDay: Number(
      requiredProgressPerDay.toFixed(2),
    ),
    risk,
  };
}
