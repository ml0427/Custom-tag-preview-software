# Low-Model Delegation Registry

這份清單描述「低模型/低判斷執行器」可以接哪些任務。Workflow 本體只依賴 task class，不依賴特定小G或小N，所以不同環境缺 runner 時不會改變流程路線。

## Task Classes

| Task class | 可交出去的工作 | 不可交出去的判斷 |
|---|---|---|
| `shell_exact` | 跑指定命令，例如 `npm run build`、`cargo test` | 決定要跑哪些測試 |
| `search_exact` | 搜指定字串或 regex | 判斷 root cause |
| `file_excerpt` | 讀指定檔案或行數 | 自行挑檔案改架構 |
| `log_filter` | 依關鍵字過濾 log | 解釋整體故障原因 |
| `diff_summary` | 收 `git status`、`git diff --stat` | 判斷能不能 merge |
| `closeout_exact` | 照明確檔案清單 stage/commit/push/close issue | 自己選檔案、寫 commit message、force push |

## Runner Registry

| Runner | 顯示名 | 可用性檢查 | 適合任務 | 備註 |
|---|---|---|---|---|
| `local-small-worker` | 小N | `ollama --version` | `shell_exact`, `search_exact`, `file_excerpt`, `log_filter`, `diff_summary`, `closeout_exact` | 有 Ollama 才用。它是快的執行器，不做架構判斷。 |
| `remote-general-worker` | 小G | adapter-managed | `file_excerpt`, `diff_summary`, `checklist_review`, `summary_draft` | 小N 不可用或需要輕量整理時用。最後決策仍由 lead agent 負責。 |
| `lead-agent` | Lead | current session | `root_cause`, `architecture_decision`, `code_edit`, `risk_acceptance`, `final_integration` | 負責判斷、實作與整合。 |

## Selection Rule

1. 先看 step 的 `task_class`。
2. 跑對應 runner 的 `availability_probe`。
3. 有通過才委派；沒有低模型可用時，只能記錄委派略過或等待 Lead 明確 handoff。
4. 委派失敗不改 workflow 路線，只記錄成環境限制。

## Execution Modes

Runner 目前支援四種低模型模式：

| Mode | 環境變數 | 實際行為 |
|---|---|---|
| record | `WORKFLOW_LOW_MODEL_MODE=record` | 只產生 `*.low-model.packet.json`，不送出。 |
| hermes | `WORKFLOW_LOW_MODEL_MODE=hermes` | 透過 Hermes CLI 呼叫小N；若 `ollama --version` 不通，改呼叫小G。 |
| ollama-review | `WORKFLOW_LOW_MODEL_MODE=ollama-review` | 把 packet 送到 OpenAI-compatible `/chat/completions`，例如 Ollama，讓低模型做執行前檢查或摘要。 |
| command | `WORKFLOW_LOW_MODEL_MODE=command` + `WORKFLOW_LOW_MODEL_COMMAND='tool --packet {packet}'` | 把 packet 交給外部 wrapper，外部 wrapper 才能真正執行命令或接 Hermes。 |

`lead-low-model` profile 使用 `record` mode 加上 `WORKFLOW_LOW_MODEL_HANDOFF_REQUIRED=1`。這條路不是讓 Lead 或同等模型直接代打；它只建立低模型 handoff 封包。Lead 必須明確把封包交給可用低模型，否則該步驟只能算「等待低模型 handoff」，不能算已委派。

Hermes 是目前主要呼叫層。`hermes` mode 會先 resolve `hermes.exe`，再依 `ollama --version` 選小N或小G：

```powershell
& $hermes --provider ollama-nemotron-3-super-cloud --model nemotron-3-super:cloud -z "<packet>"
& $hermes --provider github-copilot --model gpt-5-mini -z "<packet>"
```

純 Ollama chat API 沒有 shell tool，所以不能把 `shell_exact` 真的「交給 Ollama 執行」。若要不用 Hermes，也可以用 `ollama-review` 做低判斷檢查，或用 `command` 接其他外部 wrapper。這樣 workflow 不會謊稱已委派執行。

`--dry-run` 預設只記錄 packet，不呼叫 Hermes。要測試 Hermes 接線時才設定 `WORKFLOW_DELEGATE_IN_DRY_RUN=1`。
