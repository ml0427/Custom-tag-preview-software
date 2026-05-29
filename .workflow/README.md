# AI Workflow

本專案只使用新的「工作流管家」模式。

舊的自動直跑流程已移除，避免 AI 同時看到兩套入口後混用。所有 issue、PR、bug、feature 工作都從 `wizard start` 開始，再依照終端機提示用 `wizard resume` 推進。

## 基本指令

```powershell
node .workflow/workflow-runner.js wizard start github-issue-fix -i issue_number=63 -i repo=ml0427/Custom-tag-preview-software
node .workflow/workflow-runner.js wizard start pr-review -i base_ref=main -i target_ref=HEAD
node .workflow/workflow-runner.js wizard start bug-scan -i symptom="import repeats category prompt"
```

查看目前卡在哪一步：

```powershell
node .workflow/workflow-runner.js wizard status --run <run-id>
```

交回某一步產生的結果檔：

```powershell
node .workflow/workflow-runner.js wizard resume --run <run-id> --artifact issue_json=<path>
```

標記人工步驟已完成：

```powershell
node .workflow/workflow-runner.js wizard resume --run <run-id> --complete-step fix
```

## 工作方式

`wizard start` 會建立 `.workflow/.workflow-runs/<run-id>/wizard-state.json`。這份狀態檔會記住目前步驟、已完成步驟、已跳過步驟、缺少的 artifact、block 原因、下一個問題，以及 low-model handoff 狀態。

工作流管家每次只提示下一步。AI 完成那一步後，必須把結果檔或完成狀態交回給管家，管家才會往下一步走。

每次 `wizard start`、`wizard status`、`wizard resume` 都會先用白話顯示目前進度，例如「第 2/11 步」、「現在卡在：釐清這次要做的功能範圍」、「下一步：產出一份結果檔」。技術資訊會放在最後，方便 AI 轉貼給使用者時直接看懂目前做到哪。

## 關鍵規則

- 不再使用舊的自動直跑入口。
- `code-edit` 或 `blocks_downstream` 步驟一定會卡住，直到 Lead AI 明確回報完成。
- `lead-low-model` 只會產生 packet，不會自動算委派完成，必須明確 resolve handoff。
- closeout 前必須有 build/test、detect changes、adjacent regression review 等必要 artifact。
- 工作流 runner 不啟動 `npm run tauri dev`，驗證以 `npm run build` 為主。

## 輔助指令

```powershell
node .workflow/workflow-runner.js setup external-free
node .workflow/workflow-runner.js setup lead-low-model
node .workflow/workflow-runner.js list
node .workflow/workflow-runner.js plan github-issue-fix -i issue_number=63 -i repo=ml0427/Custom-tag-preview-software
node .workflow/workflow-runner.js validate
```
