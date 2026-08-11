import { readFile } from "node:fs/promises";

export async function getProjectTasks() {
  const file = await readFile(
    new URL("../../data/project.json", import.meta.url),
    "utf-8",
  );

  return JSON.parse(file);
}