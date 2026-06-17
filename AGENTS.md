## 前端開發規範

### Vue 寫法

- Vue SFC 一律使用 `<script setup lang="ts">`
- props / emits 必須明確定義型別
- 不在 template 內寫複雜邏輯，超過一行判斷請抽成 computed
- 元件命名使用 PascalCase
- composable 使用 `useXxx` 命名

### CSS / Layout 規則

- flex container 內的可收縮子元素必須設定 `min-width: 0`
- input、textarea、select 若位於 flex/grid 內，必須設定 `min-width: 0`
- 禁止用固定 `min-width: <px>` 當作換行斷點
- 需要換行時使用 `flex-wrap`、`flex-basis`、`grid-template-columns` 或 container 結構處理
- chip + input、tag editor、toolbar、modal footer 這類常見結構必須使用既有元件或專案固定樣板
- 修 UI overflow / 跑版時，必須修結構原因，不可只靠縮短文字、改 placeholder、微調寬度數字

### UI 元件規則

- button、input、select、modal、tag、tabs、dropdown 優先使用專案既有元件
- 不新增與既有元件功能重複的 UI 元件
- 新增可重用 UI 元件時，必須提供基本狀態：default、hover、disabled、error、loading

### 驗證規則

- 修改前端後必須執行：
  1. `npm run build`
- 若有 lint / build 錯誤，必須修到通過

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Custom-tag-preview-software** (1893 symbols, 3095 relationships, 104 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If a required GitNexus query/impact/detect_changes step warns the index is stale, run `npx gitnexus analyze` before relying on that GitNexus result. If a Codex PostToolUse hook warns after `git commit`, `git merge`, or `git push` only because HEAD advanced, treat it as advisory; do not rerun analyze unless the next step genuinely needs GitNexus analysis.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Custom-tag-preview-software/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Custom-tag-preview-software/clusters` | All functional areas |
| `gitnexus://repo/Custom-tag-preview-software/processes` | All execution flows |
| `gitnexus://repo/Custom-tag-preview-software/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## AI 工作流

- 專案內有 `.workflow/workflow-runner.js` 工作流引擎，定義四條工作流：`github-issue-fix` / `pr-review` / `bug-scan` / `feature-dev`
- 所有 issue / PR review / bug scan / feature dev 都必須走 wizard：`node .workflow/workflow-runner.js wizard start <workflow> -i key=value ...`
- 使用 `wizard start/status/resume` 推進流程；不要使用舊的 `run` 自動直跑，也不要繞過 wizard 手動串完整流程
- 依 CMD wizard 提示交回 artifact 或 `--complete-step`；`code-edit`、fix、implement 必須由 Lead agent 人工完成後再 resume
- closeout 前必須有 build/test、detect changes、adjacent regression review；Runner 只自動處理 shell 步驟和低階模型委派（小G/小N），AI 判斷由 Lead agent 接手

## AI 筆記與記憶

- 本機識別：`win:MICHAEL:ml042:dev-501cf3b58974274f`
- 此本機正式 AI 筆記路徑：`D:\AI紀錄\YYYY-MM-DD.txt`
- 不同電腦不可硬套此路徑；必須先建立該電腦的 machine key，並檢查當機既有 AI 紀錄目錄或由使用者指定
- AI 筆記只記「做了什麼、怎麼做、驗證結果」；不要把 TODO、臨時任務狀態或 wizard state 寫進 AI 筆記
- 任務狀態以 GitHub issue、commit、wizard state 為準；耐久架構/踩雷/設計記憶只寫入本地 bounded memory 或 workflow closeout artifact，不再 upsert 到 Pinecone

## Rust 踩雷

- `fs::write()` 不會自動建父目錄，寫入前必須 `fs::create_dir_all()` 確保目錄存在
- 在 Tauri command 中寫入 `app_data_dir/thumb_cache/` 等路徑時特別容易踩雷
