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
3. 有通過才委派；沒有低模型可用時，由 lead agent 自己做或略過委派。
4. 委派失敗不改 workflow 路線，只記錄成環境限制。
