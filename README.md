# プロジェクト進捗管理AIエージェント

## 概要

プロジェクトマネージャー（PM）からの自然言語による依頼を受け、プロジェクトのタスク情報やGitHub Issueを確認し、プロジェクトの進捗状況やスケジュールリスクを確認できるCLI型のAIエージェントです。

また、タスクの進捗更新を自然言語で依頼し、ユーザーの承認後に `project.json` の進捗を更新できます。

本プロジェクトでは、LLMによる判断だけに依存せず、TypeScript側で確定的に処理すべき内容はTypeScriptで処理することを意識して設計しています。

---

## 想定ユーザーと業務シナリオ

### 想定ユーザー

プロジェクトマネージャー（PM）を想定しています。

### 業務シナリオ

プロジェクトの進捗確認時に、PMが自然言語でAgentに依頼します。

Agentはプロジェクトタスク、GitHub Issue、現在日時をToolから取得し、タスクごとの進捗状況とスケジュールリスクを整理して表示します。

また、PMがタスクの進捗更新を依頼した場合は、現在の進捗と更新内容を提示し、ユーザーの承認後に `project.json` の進捗を更新します。

これにより、複数の情報源を個別に確認する作業と、進捗状況を整理する作業を短縮することを目的としています。

---

## 主な機能

### 1. プロジェクトタスクの確認

自然言語でプロジェクトの進捗確認を依頼できます。

```text
タスクの進捗とリスクを確認したい
```

プロジェクトのタスク情報を取得し、以下の情報を表示します。

* タスク名
* 進捗
* 期限
* 残り進捗
* 残り日数
* 必要進捗ペース
* スケジュールリスク
* 関連するGitHub Issue

---

### 2. スケジュールリスク分析

タスクの進捗と期限から、TypeScript側でスケジュールリスクを計算します。

リスクは以下の3段階で判定します。

| リスク | 判定基準                       |
| --- | -------------------------- |
| 高   | 必要進捗ペースが25%以上、または期限超過・当日期限 |
| 中   | 必要進捗ペースが10%以上25%未満         |
| 低   | 必要進捗ペースが10%未満              |

リスク判定は `analyzeScheduleRisk.ts` で実施し、LLMが判定結果を変更・再評価しない設計としています。

---

### 3. GitHub Issueとの連携

GitHub APIからIssue情報を取得し、スケジュールリスク分析の補足情報として利用します。

取得する主な情報は以下です。

* Issue番号
* Issueタイトル
* Issueの状態

GitHub IssueについてはReadOnlyで取得のみを行い、Issueの作成・更新・削除などは行いません。

---

### 4. タスク進捗の更新

自然言語でタスクの進捗更新を依頼できます。

```text
API開発を80%に更新したい
```

更新前に現在のタスク情報を確認し、変更内容を提示します。

```text
現在の進捗: 70%
更新後の進捗: 80%

この内容で更新してよろしければ「はい」と返信してください。
```

ユーザーが明示的に承認した場合のみ、進捗を更新します。

なお、`project.json` で更新可能なのは `progress` のみです。

---

## システム構成

```text
ユーザー
   │
   │ 自然言語による依頼
   ▼
┌─────────────────────┐
│      AI Agent       │
│     (OpenAI API)    │
└─────────┬───────────┘
          │
          │ Tool Calling
          ▼
┌───────────────────────────────┐
│             Tools             │
├───────────────────────────────┤
│ get_project_tasks             │
│ get_github_issues             │
│ get_current_datetime          │
│ analyze_schedule_risk         │
│ update_project_task           │
└──────────────┬────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
 project.json       GitHub API
```

---

## Tool一覧

| Tool                    | 役割             | 操作              |
| ----------------------- | -------------- | --------------- |
| `get_project_tasks`     | プロジェクトタスク取得    | 読み取り            |
| `get_github_issues`     | GitHub Issue取得 | 読み取り            |
| `get_current_datetime`  | 現在日時取得         | 取得              |
| `analyze_schedule_risk` | スケジュールリスク分析    | TypeScriptで計算   |
| `update_project_task`   | タスク進捗更新        | `progress` のみ更新 |

---

## 設計上のポイント

### 1. 現在日時をToolから取得

現在日時をLLMに推測させず、`get_current_datetime` Toolから取得した日時のみを使用します。

スケジュールリスク分析では、この日時を基準日として使用します。

---

### 2. リスク判定をTypeScript側で実施

スケジュールリスクはLLMに自由に判断させず、TypeScriptの `analyzeScheduleRisk` で計算します。

これにより、同じ条件であれば同じ判定結果になるようにしています。

LLMは計算された `risk` を変更せず、結果を日本語で表示します。

```text
high   → 高
medium → 中
low    → 低
```

---

### 3. Toolの実行権限を明確化

現在のToolで実行できない操作について、Agentが実行したかのように回答しないようにしています。

例えば、GitHub Issueの更新機能は実装していないため、

```text
GitHub Issueを更新します
```

とは案内せず、実行できない操作と対応案を区別します。

---

### 4. 進捗更新にはユーザーの承認が必要

進捗更新を依頼された場合でも、すぐに更新処理を実行しません。

以下の順番で処理します。

1. 現在のタスク情報を取得
2. 現在の進捗を確認
3. 更新後の進捗を提示
4. ユーザーに確認
5. 承認された場合のみ更新

これにより、Agentの判断だけでプロジェクトデータが変更されることを防いでいます。

---

### 5. エラーハンドリング方針

処理全体が不必要に停止しないよう、エラーの種類に応じて処理を分けています。

1. Agent全体のエラーとして処理を終了

   * OpenAI APIの呼び出し失敗
   * Agent Loopを継続できないエラー
   * Agent Loopの最大実行回数超過

2. エラー情報をLLMへ返し、処理を継続

   * Tool実行時のエラー
   * LLMがエラー内容をもとに状況を判断できるようにしています。

3. 正常なデータはエラーとして扱わない

   * GitHub Issueが存在しないなどの空データは、正常な結果としてLLMへ渡します。
   * Toolの引数やAPIレスポンスは、想定した形式・範囲を確認します。


---

## 使用したLLM API

### OpenAI API

LLM APIにはOpenAI APIを使用しています。

今回の「自然言語による依頼 → Tool選択 → Tool実行 → 結果をもとに判断」というAgent構成を、シンプルな構成で実装・検証できる点を重視してOpenAI APIを選定しました。

### モデル変更時に影響を受ける箇所

現在は以下の2箇所で gpt-5-mini を使用しています。

- Agent開始時のLLM呼び出し
- Tool実行結果をLLMへ返す際のLLM呼び出し

モデルによってTool CallingやStructured Outputなどの対応状況・仕様が異なる場合があるため、以下への影響を確認する必要があります。

- src/agent/systemPrompt.ts の指示内容
- モデル変更後のAgentの回答品質・Tool選択精度

### APIキー・シークレット

OpenAI API KeyおよびGitHub Tokenは `.env` に設定します。

`.env` はGitHubにコミットしないよう `.gitignore` に設定しています。

### コストについて

本プロジェクトでは、必要な情報取得やTool Callingに限定してLLMを利用しています。

一方、スケジュールリスクの計算など、ルールとして定義できる処理はTypeScript側で実行することで、LLMによる不要な処理や追加のAPI利用を抑えています。

---

## 入力例

### うまくいく入力例

対象や依頼内容が明確な場合は、Agentが必要なToolを呼び出して処理します。

```text
タスクの進捗とリスクを確認したい
```

```text
テストの進捗を10%にしてください
```

---

### 苦手な入力例

以下のように、対象タスクや更新内容を特定できない依頼には対応できません。

```text
進捗を更新して
```

```text
あのタスクを50%にして
```

この場合、対象タスクや必要な情報を推測せず、確認を求めます。

---

## セットアップ

### 1. リポジトリを取得

```bash
git clone <リポジトリURL>
cd project-agent
```

### 2. パッケージをインストール

```bash
npm install
```

### 3. プロジェクト情報を設定

`data/project.json` にプロジェクトのタスク情報を設定します。

設定できる項目は以下です。

* プロジェクト名
* タスクID
* タスク名
* 進捗率
* Deadline
* Status

例：

```json
{
  "projectName": "Webシステム開発プロジェクト",
  "tasks": [
    {
      "id": 1,
      "name": "API開発",
      "progress": 80,
      "deadline": "2026-08-10",
      "status": "in_progress"
    },
    {
      "id": 2,
      "name": "画面開発",
      "progress": 80,
      "deadline": "2026-08-20",
      "status": "in_progress"
    }
  ]
}
```

### 4. 環境変数を設定

`.env` を作成し、OpenAI API KeyとGitHubの接続情報を設定します。

```env
OPENAI_API_KEY=your_openai_api_key
GITHUB_TOKEN=your_github_token
GITHUB_OWNER=your_github_owner
GITHUB_REPO=your_repository_name
```

例えば、対象リポジトリが

```text
https://github.com/example/project-agent
```

の場合、

```env
GITHUB_OWNER=example
GITHUB_REPO=project-agent
```

と設定します。

Agentは指定したGitHubリポジトリのIssue一覧を取得し、スケジュールリスク分析に利用します。

GitHub Issueの作成・更新・削除などは行わず、Issue情報の取得のみを行います。

`.env` にはAPI KeyやGitHub Tokenなどの機密情報が含まれるため、GitHubへコミットしないでください。

### 5. Agentを起動

```bash
npm run dev
```

起動すると以下のように表示されます。

```text
プロジェクト管理Agentを起動しました。
終了する場合は「exit」または「quit」と入力してください。

あなた:
```

---

## デモ

### 1. 進捗・リスク確認

```text
あなた: タスクの進捗とリスクを確認したい
```

Agentがプロジェクトタスク、GitHub Issue、現在日時を取得し、タスクごとのスケジュールリスクを表示します。

出力例：

```text
1) API開発
- 進捗: 80%
- 期限: 2026-08-10
- 残り進捗: 20%
- 残り日数: 0日
- 必要進捗/日: 20%/日
- リスク: 高
- 関連GitHub Issue:
  - #1 API認証処理が未完了 (open)
  - #2 APIエラーハンドリング (open)
  - #3 APIレスポンスの修正 (open)

2) 画面開発
- 進捗: 80%
- 期限: 2026-08-20
- 残り進捗: 20%
- 残り日数: 10日
- 必要進捗/日: 2%/日
- リスク: 低
- 関連GitHub Issue:
  - #4 画面レイアウト調整 (open)

3) テスト
- 進捗: 20%
- 期限: 2026-08-30
- 残り進捗: 80%
- 残り日数: 20日
- 必要進捗/日: 4%/日
- リスク: 低
- 関連GitHub Issue:
  - #5 テストケース作成 (open)
```

### 2. 進捗更新

```text
あなた: テストの進捗を10%にしてください
```

Agentが現在の進捗を確認した後、更新内容を提示します。

```text
現在の進捗: 20%
更新後の進捗: 10%

この内容で更新してよろしければ「はい」と返信してください。
```

ユーザーが承認すると、`update_project_task` を実行して進捗を更新します。

---

## 制約事項

現在の実装では、以下の操作には対応していません。

* GitHub Issueの作成・更新・削除
* GitHub Issueの担当者変更
* 担当者の自動アサイン
* リソースの追加
* タスクの作成・削除
* タスク名の変更
* Deadlineの変更
* Statusの変更

また、`project.json` で更新できるのは `progress` のみです。

---

## プロジェクト構成

```text
project-agent/
├── src/
│   ├── domain/
│   │   └── analyzeScheduleRisk.ts
│   │
│   ├── agent/
│   │   ├── loop.ts
│   │   └── systemPrompt.ts
│   │
│   ├── tools/
│   │   ├── getProjectTasks.ts
│   │   ├── getGithubIssues.ts
│   │   ├── getCurrentDateTime.ts
│   │   └── updateProjectTask.ts
│   │
│   └── index.ts
│
├── data/
│   └── project.json
│
├── .env
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 使用技術

* TypeScript
* Node.js
* OpenAI API
* GitHub API
* tsx
* dotenv

---

## 実務投入する場合の改善点

現在の実装は、小規模なCLI型エージェントとして構成しています。

実務投入する場合は、以下の機能を追加することで、より実運用に近い構成にできると考えています。

* GitHub Issueの作成・更新機能
* タスクの追加・削除
* DeadlineやStatusの更新
* 担当者管理
* プロジェクト全体の進捗レポート生成
* エラー発生時のリトライ
* 実行ログの記録
* コスト・レイテンシの計測
* Web UI化
* CI/CDとの連携
