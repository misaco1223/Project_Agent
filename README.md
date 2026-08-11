# Project Management AI Agent

## 1. Overview

自然言語によるプロジェクト管理の依頼に対して、AI Agentがプロジェクト情報やGitHub Issueを取得・分析し、進捗状況やスケジュールリスクを報告するCLIアプリケーションです。

また、タスクの進捗更新については、Agentが現在の状態と変更内容を提示し、ユーザーの明示的な承認を得た場合のみ更新を実行します。

### 主な機能

* プロジェクトタスクの取得
* GitHub Issueの取得
* タスクのスケジュールリスク分析
* プロジェクト情報とGitHub Issueを組み合わせた状況判断
* 自然言語による進捗更新
* 更新前のユーザー確認（Human-in-the-loop）
* `project.json`への進捗情報の永続化
* CLIによる対話形式での操作

---

## 2. Background / Problem

プロジェクト管理では、プロジェクト管理ファイルとGitHub Issueなど、複数の情報源を確認しながら進捗や遅延リスクを判断する必要があります。

例えば、毎日の進捗確認では、

1. プロジェクトのタスク一覧を確認する
2. 各タスクの進捗と期限を確認する
3. GitHub Issueの未完了項目を確認する
4. 遅延リスクを判断する
5. 現状と対応案をまとめる

といった作業が必要になります。

本アプリでは、これらの情報収集・分析・報告をAI Agentに行わせることで、プロジェクト状況の確認作業を効率化することを目的としています。

---

## 3. Target Users

* Web開発プロジェクトのPM
* PMO
* 開発チームのプロジェクト進捗を確認するメンバー

---

## 4. Use Cases

### Use Case 1: 毎日の進捗確認

ユーザー：

```text
タスクの進捗とリスクを確認したい
```

Agentは以下の情報を取得します。

* プロジェクトタスク
* GitHub Issue
* タスクの期限・進捗

その後、スケジュールリスクを分析し、現状・リスク・推奨アクションを報告します。

### Use Case 2: タスクの進捗更新

ユーザー：

```text
API開発を80%に更新したい
```

Agentはまず現在のタスク情報を取得し、

```text
現在の進捗: 70%
更新後の進捗: 80%
```

のように変更内容を提示します。

ユーザーが明示的に承認した場合のみ、更新Toolを実行します。

```text
この内容で進捗を「80%」に更新してよろしいですか？

ユーザー:
はい
```

承認後、`project.json`の対象タスクの`progress`を更新します。

### Use Case 3: 更新のキャンセル

ユーザーが更新を承認しなかった場合、更新Toolは実行されません。

```text
ユーザー:
いいえ

Agent:
承知しました。更新は行いません。
```

---

## 5. Demo

### 5.1 Progress / Risk Analysis

```text
あなた: タスクの進捗とリスクを確認したい
```

Agentは、

* プロジェクトタスク
* GitHub Issue
* スケジュールリスク

を確認し、以下のような形式で報告します。

```text
API開発
- 進捗: 70%
- 期限: 2026-08-10
- リスク: high
- 関連Issue: #1, #2, #3

画面開発
- 進捗: 80%
- 期限: 2026-08-20
- リスク: low

テスト
- 進捗: 20%
- 期限: 2026-08-30
- リスク: low
```

### 5.2 Progress Update

```text
あなた: API開発を80%に更新したい
```

Agent：

```text
現在の進捗: 70%
更新後の進捗: 80%

この内容で進捗を「80%」に更新してよろしいですか？
```

ユーザーが承認すると、

```text
update_project_task
```

が実行され、`project.json`の進捗が更新されます。

### 5.3 Update Cancellation

```text
あなた: API開発を80%に更新したい

Agent:
現在70%です。80%に更新してよろしいですか？

あなた: いいえ

Agent:
更新は行いません。
```

この場合、プロジェクトデータは変更されません。

---

## 6. Architecture

```text
┌─────────────────────────────┐
│           User              │
│     Natural Language        │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│        AI Agent             │
│       OpenAI API            │
│                             │
│  Tool selection / Reasoning │
└──────────────┬──────────────┘
               │
       ┌───────┼────────┬──────────────┐
       ▼       ▼        ▼              ▼
   Project   GitHub   Risk Analysis   Update
    Tasks    Issues     (TypeScript)   Task
       │       │        │              │
       ▼       ▼        ▼              ▼
project.json GitHub   Risk Result    project.json
```

### Technology Stack

* TypeScript
* Node.js
* OpenAI API
* GitHub REST API
* `tsx`
* JSON

---

## 7. Agent Loop

Agentはユーザーからの自然言語入力を受け取り、必要なToolを選択して実行します。

基本的な処理フローは以下の通りです。

```text
User Input
    ↓
LLM
    ↓
Tool Selection
    ↓
Tool Execution
    ↓
Tool Result
    ↓
LLM
    ↓
Final Response
```

例えば進捗・リスク確認では、

```text
User
 ↓
get_project_tasks
 ↓
get_github_issues
 ↓
analyze_schedule_risk
 ↓
LLMによる総合判断
 ↓
Userへの報告
```

という流れになります。

---

## 8. Tools

### `get_project_tasks`

`data/project.json`からプロジェクトとタスク情報を取得します。

取得する主な情報：

* Task ID
* Task Name
* Progress
* Deadline
* Status

### `get_github_issues`

GitHub REST APIからIssue一覧を取得します。

取得する情報：

* Issue Number
* Title
* State

GitHub APIは本アプリではReadOnlyで利用しています。

### `analyze_schedule_risk`

TypeScript側でタスクの期限と進捗からスケジュールリスクを計算します。

主な計算項目：

* 残日数
* 残進捗
* 期限までに必要な1日あたりの進捗率
* リスクレベル（high / medium / low）

計算結果とGitHub Issue情報をLLMへ渡し、最終的な状況判断を行います。

### `update_project_task`

ユーザーの明示的な承認後に、指定されたタスクの`progress`を更新します。

更新対象は`progress`のみです。

* Task Name：更新不可
* Deadline：更新不可
* Status：更新不可
* Progress：更新可能

---

## 9. Data Model

### Project

```json
{
  "projectName": "Webシステム開発プロジェクト",
  "tasks": []
}
```

### Task

```json
{
  "id": 1,
  "name": "API開発",
  "progress": 70,
  "deadline": "2026-08-10",
  "status": "in_progress"
}
```

### Schedule Risk

```text
high
medium
low
```

リスク分析では以下の情報を生成します。

* Task ID
* Task Name
* Progress
* Deadline
* Remaining Days
* Remaining Progress
* Required Progress Per Day
* Risk

---

## 10. Error Handling

以下のようなエラーを想定しています。

### 存在しないタスクID

```text
タスクID 999を50%に更新して
```

存在しないタスクの場合、更新を実行せず、ユーザーに対象タスクが存在しないことを伝えます。

### 不正な進捗値

進捗率は0〜100の整数のみ受け付けます。

```text
-1
101
50.5
```

などの値は更新できません。

### GitHub APIエラー

GitHub APIから正常なレスポンスを取得できなかった場合は、APIエラーとして処理します。

### 必要な環境変数がない場合

GitHub連携に必要な環境変数が設定されていない場合はエラーとして通知します。

---

## 11. Security

### API Key / Token

API KeyやGitHub Tokenはソースコードに直接記述せず、環境変数から取得します。

```text
OPENAI_API_KEY
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
```

`.env`はGit管理対象外とし、`.env.example`を提供します。

### GitHub Access

GitHub APIはIssueの取得にのみ利用し、Issueの作成・更新・削除は行いません。

### Update Approval

プロジェクトデータを変更する操作については、ユーザーの明示的な承認後にのみ更新Toolを実行します。

---
## 12. Setup

### Requirements

* Node.js
* npm
* OpenAI API Key
* GitHub Personal Access Token

### Install

```bash
npm install
```

### Environment Variables

`.env.example`を参考に`.env`を作成します。

```text
OPENAI_API_KEY=
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
```

以下の環境変数を設定してください。

| Variable         | Description                |
| ---------------- | -------------------------- |
| `OPENAI_API_KEY` | OpenAI APIを利用するためのAPI Key  |
| `GITHUB_TOKEN`   | GitHub APIへのアクセスに使用するToken |
| `GITHUB_OWNER`   | GitHubリポジトリのOwner          |
| `GITHUB_REPO`    | GitHubリポジトリ名               |

### Run

```bash
npm run dev
```

---

## 13. Usage

アプリケーションを起動すると、CLI上で自然言語による指示を入力できます。

```text
$ npm run dev

プロジェクト管理Agentを起動しました。
終了する場合は「exit」または「quit」と入力してください。

あなた: タスクの進捗とリスクを確認したい
```

Agentは必要に応じて以下のToolを呼び出します。

```text
get_project_tasks
get_github_issues
analyze_schedule_risk
```

タスクの進捗更新を依頼する場合は、変更前の状態を確認したうえで、ユーザーに更新内容を提示します。

```text
あなた: API開発を80%に更新したい

Agent:
現在の進捗: 70%
更新後の進捗: 80%

この内容で進捗を「80%」に更新してよろしいですか？
```

ユーザーが承認した場合のみ、

```text
update_project_task
```

が実行されます。

### Exit

以下のいずれかを入力するとAgentを終了します。

```text
exit
```

または

```text
quit
```

---

## 14. Limitations

現在の実装には以下の制約があります。

* GitHub APIはReadOnlyであり、Issueの作成・更新・削除はできない
* プロジェクトデータとして更新できるのはタスクの`progress`のみ
* タスクの作成・削除はできない
* DeadlineやStatusをユーザーから直接変更することはできない
* プロジェクトデータはJSONファイルで管理している
* GitHub Issueとプロジェクトタスクの関連付けは、取得したIssue情報をもとにAgentが判断する
* 担当者の自動アサインやリソース調整などの操作は実行できない

---

## 15. Future Improvements

* データベースによるプロジェクト情報管理
* タスクの作成・削除・期限変更への対応
* GitHub Issueとプロジェクトタスクの明示的な関連付け
* GitHub Issueの更新機能
* 担当者・アサイン情報の管理
* Slackなどへの通知機能
* Web UI / ダッシュボードの追加
* リスク分析ロジックの高度化
* 自動テストの追加・拡充
* 複数プロジェクトへの対応

```
```
