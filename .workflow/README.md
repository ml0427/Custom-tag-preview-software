# Portable AI Workflow Runner

這是一個跨 AI 的工作流雛形。`workflow.yaml` 負責定義流程，`workflow-runner.js` 負責執行可機械化的步驟，並把需要 AI 判斷的步驟輸出成 prompt artifact。

## 安裝

```powershell
npm install
```

## 查看工作流

```powershell
npm run list
```

## 查看低模型 / 低判斷執行器

```powershell
node workflow-runner.js runners
```

這個指令會讀 `workflow.yaml` 的 `delegation_policy.runner_registry`，並執行可用性檢查。現在的規則是：

- 小N / `local-small-worker`：用 `ollama --version` 檢查，通過才拿來跑 exact command、search、file excerpt、log filter、diff summary、指定 closeout。
- 小G / `remote-general-worker`：由 adapter 管理可用性，適合整理、摘要、檢查清單，不負責最後判斷。
- Lead / `lead-agent`：永遠是目前主 agent，負責 root cause、架構決策、code edit、風險接受與最後整合。

Workflow step 只標 `task_class`，不直接綁小G或小N。低模型不可用時，流程不改路線，只是由 lead agent 自己做或記錄委派略過。

## 只看執行計畫

```powershell
node workflow-runner.js plan pr-review --input base_ref=main --input target_ref=HEAD
```

```powershell
node workflow-runner.js plan github-issue-fix --input issue_number=63 --input repo=ml0427/Custom-tag-preview-software
```

## 乾跑

```powershell
node workflow-runner.js run pr-review --input base_ref=main --input target_ref=HEAD --dry-run
```

```powershell
node workflow-runner.js run bug-scan --input symptom="import repeats category prompt" --dry-run
```

```powershell
node workflow-runner.js run github-issue-fix --input issue_number=63 --input repo=ml0427/Custom-tag-preview-software --dry-run
```

## 實際跑 shell step

```powershell
node workflow-runner.js run pr-review --input base_ref=main --input target_ref=HEAD
```

```powershell
node workflow-runner.js run github-issue-fix --input issue_number=63 --input repo=ml0427/Custom-tag-preview-software
```

`pr-review` 與 `bug-scan` 的完成驗證只要求 `npm run build`。`github-issue-fix` 會把 `npm run build` 與 `npm run tauri dev` 都列入 verify step；如果 `tauri dev` 因 Windows 鎖檔或環境限制不能跑，應記錄為環境限制，不要直接當成程式錯誤。

每次執行會在 `.workflow-runs/` 產生：

- `*.prompt.md`：交給任意 AI adapter 的步驟提示
- `run-report.json`：執行結果、shell output、AI placeholder output

目前 AI adapter 是 placeholder。它會針對少數固定步驟做簡單啟發式輸出，其餘步驟產生 prompt 檔，之後可以接 Claude、Codex、Gemini、Ollama 或其他 runner。

低模型任務分類與 runner 清單另外整理在 `low-models.md`。那份文件是人看的；`workflow.yaml` 裡的 registry 是機器讀的。
