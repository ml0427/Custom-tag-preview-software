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

## 查看 Adapter 設定

```powershell
node workflow-runner.js adapters
```

預設狀態是：

- `WORKFLOW_AI_ADAPTER=placeholder`：AI step 只寫 prompt 檔並使用少量內建 placeholder。
- `WORKFLOW_LOW_MODEL_MODE=record`：可委派的 shell step 會產生 `*.low-model.packet.json`，但不送出。

主要低模型呼叫層是 Hermes：

```powershell
$env:WORKFLOW_LOW_MODEL_MODE='hermes'
node workflow-runner.js run github-issue-fix --input issue_number=63 --input repo=ml0427/Custom-tag-preview-software --dry-run
```

`--dry-run` 預設只產生 low-model packet，不會真的呼叫 Hermes。若要測 Hermes 接線，可明確打開：

```powershell
$env:WORKFLOW_DELEGATE_IN_DRY_RUN='1'
```

Hermes mode 會先 resolve `hermes.exe`，再跑 `ollama --version`。有 Ollama 就呼叫小N：

```powershell
& $hermes --provider ollama-nemotron-3-super-cloud --model nemotron-3-super:cloud -z "<packet>"
```

沒有 Ollama 就 fallback 小G：

```powershell
& $hermes --provider github-copilot --model gpt-5-mini -z "<packet>"
```

要真的接 AI adapter，可使用 OpenAI-compatible API：

```powershell
$env:WORKFLOW_AI_ADAPTER='openai-compatible'
$env:WORKFLOW_AI_BASE_URL='https://api.openai.com/v1'
$env:WORKFLOW_AI_MODEL='gpt-4.1-mini'
$env:WORKFLOW_AI_API_KEY='...'
node workflow-runner.js run github-issue-fix --input issue_number=63 --input repo=ml0427/Custom-tag-preview-software
```

不用 Hermes 時，也可以把低判斷 shell step 送到 OpenAI-compatible endpoint 做執行前檢查紀錄：

```powershell
$env:WORKFLOW_LOW_MODEL_MODE='ollama-review'
$env:WORKFLOW_LOW_MODEL_BASE_URL='http://localhost:11434/v1'
$env:WORKFLOW_LOW_MODEL='llama3.1'
node workflow-runner.js run github-issue-fix --input issue_number=63 --input repo=ml0427/Custom-tag-preview-software --dry-run
```

如果有其他真正能執行任務 packet 的外部 wrapper，可用 command mode：

```powershell
$env:WORKFLOW_LOW_MODEL_MODE='command'
$env:WORKFLOW_LOW_MODEL_COMMAND='hermes-runner --packet {packet}'
```

注意：純 Ollama `/v1/chat/completions` 只能做低判斷檢查或摘要，不能自己執行 shell。要讓小N 真正跑命令，需要外部 wrapper 或 Hermes 類 runner 接 `*.low-model.packet.json`。

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

`pr-review`、`bug-scan` 與 `github-issue-fix` 的完成驗證只要求 `npm run build`。工作流 runner 不會啟動 `npm run tauri dev`。

`code-edit` 這類 manual step 會阻斷後續步驟。也就是說 `github-issue-fix` 跑到 `fix` 時會停下來，不會在程式碼尚未修改前自動跑 `verify`。完成修正後，由 lead agent 手動執行 `npm run build`，或在記錄 patch output 後再繼續工作流。

Closeout 注意事項：

- `npm run build` 會透過 `scripts/stamp-build.cjs` 更新 `index.html` 與 `src-tauri/tauri.conf.json` 的時間戳；commit 前要把這兩個 stamp 變更一起納入，或明確清乾淨。
- patch 工具若在 declaration file 上報 TS18028 private identifier，但 `npm run build`、`tsc --noEmit` 或 `vue-tsc --noEmit` 乾淨，視為 patch 工具誤報。
- 不自動 force push；遇到 branch protection 擋下 amend 後推送時，要交給 lead/user 決定。

每次執行會在 `.workflow-runs/` 產生：

- `*.prompt.md`：交給任意 AI adapter 的步驟提示
- `*.low-model.packet.json`：可委派 shell step 的低模型任務封包
- `run-report.json`：執行結果、shell output、AI placeholder output

目前 AI adapter 預設是 placeholder。設定 `WORKFLOW_AI_ADAPTER=openai-compatible` 或 `WORKFLOW_AI_ADAPTER=ollama` 後，AI step 會真的呼叫 `/chat/completions`，並把回傳寫入 `run-report.json`。

低模型任務分類與 runner 清單另外整理在 `low-models.md`。那份文件是人看的；`workflow.yaml` 裡的 registry 是機器讀的。
