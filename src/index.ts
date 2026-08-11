/*import OpenAI from "openai";
import "dotenv/config";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { runAgent } from "./agent/loop.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const rl = readline.createInterface({
  input,
  output,
});

let previousResponseId: string | undefined;

try {
  console.log("AIエージェントを開始します。");
  console.log("終了する場合は「終了」と入力してください。");

  while (true) {
    const userInput = await rl.question("あなた: ");

    if (userInput.trim() === "終了") {
      console.log("AIエージェントを終了します。");
      break;
    }

    if (userInput.trim() === "") {
      continue;
    }

    const result = await runAgent(
      client,
      userInput,
      previousResponseId,
    );

    console.log("Agent:");
    console.log(result.text);

    previousResponseId = result.responseId;
  }
} finally {
  rl.close();
}
*/

import OpenAI from "openai";
import "dotenv/config";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { runAgent } from "./agent/loop.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const rl = readline.createInterface({
  input,
  output,
});

let previousResponseId: string | undefined;

try {
  console.log("プロジェクト管理Agentを起動しました。");
  console.log("終了する場合は「exit」または「quit」と入力してください。");
  console.log();

  while (true) {
    const answer = await rl.question("あなた: ");

    const trimmedAnswer = answer.trim();

    if (
      trimmedAnswer.toLowerCase() === "exit" ||
      trimmedAnswer.toLowerCase() === "quit"
    ) {
      console.log("Agentを終了します。");
      break;
    }

    if (trimmedAnswer === "") {
      continue;
    }

    const result = await runAgent(
      client,
      trimmedAnswer,
      previousResponseId,
    );

    console.log();
    console.log("Agent:");
    console.log(result.text);
    console.log();

    previousResponseId = result.responseId;
  }
} finally {
  rl.close();
}

