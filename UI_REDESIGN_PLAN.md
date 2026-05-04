# UI 改造計畫 — Obsidian Amber Design System

## 設計方向
以 `mockup.html` 為視覺標準（Obsidian Amber 風格）：
- 近乎純黑底色、琥珀金主色、極銳邊框
- 字型：`Syne`（UI）+ `DM Mono`（數據）+ `Noto Sans JP`（日文）
- 圓角極小（2–6px），工具感優先於圓潤感

## 四套主題（已完成）
| ID | 風格 | 主色 | 字型 |
|----|------|------|------|
| `obsidian` | 假畫面那套，深黑琥珀 | `#f0b429` | Syne + DM Mono |
| `forge` | 熔鐵工業，零圓角 | `#ff6b35` | Barlow Condensed + IBM Plex Mono |
| `parchment` | 書目卡片，唯一亮色 | `#b0431e` | Bitter + DM Mono |
| `phosphor` | CRT 終端機，步進 transition | `#00ff41` | Share Tech Mono |

## 進度追蹤

| Phase | 元件 | 狀態 | 版本 |
|-------|------|------|------|
| 0 | `style.css` + `themes.css` 主題系統 | ✅ 完成 | v0.46 |
| 1 | `ActivityBar.vue` | ✅ 完成 | v0.47 |
| 2 | `SourcePanel.vue` | ✅ 完成 | v0.48 |
| 3 | `FileExplorerTable.vue` | ✅ 完成 | v0.49 |
| 4 | `ThumbnailGridView.vue` | ⬜ 待做 | — |
| 5 | `PreviewPane.vue` | ⬜ 待做 | — |
| 6 | `TagSidebar.vue` | ⬜ 待做 | — |
| 7 | `ItemGallery.vue` | ⬜ 待做 | — |
| 8 | `ItemDetailModal.vue` | ⬜ 待做 | — |
| 9 | `App.vue` 收尾 | ⬜ 待做 | — |

---

## Phase 1 — ActivityBar.vue
**目標：** 窄化至 44px、emoji icon 換 SVG、amber logo 方塊、主題點改為直排

**視覺標準：** 參考 `mockup.html` 的 `.activity-bar` 區塊

改動清單：
- `width: 56px` → `44px`
- app logo：新增一個 `div.app-logo`，amber 背景 + SVG 檔案 icon
- 三個 activity 按鈕：移除 emoji，改用內聯 SVG（與 mockup 相同）
- 按鈕：`width: 40px` → `34px`，`height: 40px` → `34px`
- `active::before` 指示條：`width: 3px` → `2px`
- theme swatches：class 改名為 `theme-dots`，dot size `14px` → `10px`
- `ring` 支援：若主題有 `ring` 值，dot 改用 `border: 1px solid` 而非 `box-shadow`
- 移除 `.label` span（mockup 無文字標籤）

---

## Phase 2 — SourcePanel.vue
**目標：** 樹狀結構密度提升，folder icon 改 SVG，新增分隔線

改動清單：
- panel 寬度維持 240px（可調）
- panel-header：高度壓縮，label 改 DM Mono 全大寫 9px
- 搜尋欄：font-family 改 `var(--font-mono)`
- 樹狀節點 `.dir-tree-node`：行高壓縮，folder emoji 改 SVG
- 新增 `.tree-sep`（`height: 1px; background: var(--border-subtle); margin: 6px 10px`）
- count badge：font-family 改 `var(--font-mono)`，背景改 `var(--bg-elevated)`
- footer 按鈕：改 ghost 樣式，移除背景色

---

## Phase 3 — FileExplorerTable.vue
**目標：** 列表行視覺與 mockup 對齊

改動清單：
- 表頭（`.th`）：font-family → `var(--font-mono)`，9px 全大寫
- 行高 `ROW_HEIGHT`：確認是否需要由 44 調整為 48
- 選中列：加 `::before` 左側 2px amber 指示條
- tag chip：統一使用新設計（含色點 `::before` + 半透明背景）
- 檔名欄：font-family → `var(--font-jp)`
- 日期/大小：font-family → `var(--font-mono)`，顏色 `var(--text-tertiary)`
- type 色點：沿用現有邏輯，尺寸統一

---

## Phase 4 — ThumbnailGridView.vue
**目標：** 卡片視覺更銳利，hover 狀態改為 amber border

改動清單：
- 卡片圓角：改 `var(--radius-sm)`（預設 2px）
- hover lift 效果 → 改為 `border-color: var(--accent)` + 極淡背景
- category bar overlay：維持底部漸層，顏色改用 accent
- tag chip：與 Phase 3 一致
- 縮圖 placeholder：背景改 `var(--bg-elevated)`

---

## Phase 5 — PreviewPane.vue
**目標：** 資訊層次更清晰，底部加 action 按鈕列

改動清單：
- section label：font-family → `var(--font-mono)`，9px 全大寫，`letter-spacing: 0.12em`
- 備註 textarea：font-family → `var(--font-jp)`
- 圖片區：加 `linear-gradient(to top, rgba(0,0,0,0.5), transparent)` overlay
- metadata grid：key 用 `var(--font-mono)` + `var(--text-tertiary)`，value 用 `var(--font-mono)` + `var(--text-secondary)`
- 底部新增 action bar：「編輯標籤」+ 「開啟」兩個按鈕，border-top 分隔

---

## Phase 6 — TagSidebar.vue
**目標：** tag chip 樣式統一，UI 更精簡

改動清單：
- tag chip：與 Phase 3 相同設計
- 搜尋欄：font-family → `var(--font-mono)`
- color picker：保留現有 9 色邏輯，swatch 改為 10px 圓點排列
- count badge：font-family → `var(--font-mono)`
- footer 按鈕：改 ghost 樣式

---

## Phase 7 — ItemGallery.vue（高風險）
**目標：** TopBar、status bar、batch action bar 改造

改動清單：
- 搜尋欄：與 mockup 的 `.sw` 相同（左側 SVG icon，DM Mono 字型）
- sort select：font-family → `var(--font-mono)`，11px
- view toggle：`.vbtns` 設計（`var(--bg-elevated)` 背景，active 改 amber-glow）
- status bar：font-family → `var(--font-mono)`，10px，`var(--text-tertiary)`
- batch action bar：圓角縮小，按鈕改 ghost/danger 風格

---

## Phase 8 — ItemDetailModal.vue
**目標：** modal 面板視覺更紮實

改動清單：
- `.glass-panel` modal → `background: var(--bg-elevated); border: 1px solid var(--border-default)`（移除過度透明感）
- 封面圖框：hover 時 `border-color: var(--accent)` 替代原有 zoom shadow
- tag chip：統一新設計
- 左欄 section label：DM Mono 全大寫 9px

---

## Phase 9 — App.vue 收尾
改動清單：
- scan progress bar：顏色改 `var(--accent)`
- panel slide transition：timing 調整為 `var(--transition-base)`
- 整體 layout gap/padding 統一

---

## Tag Chip 設計規格（全元件通用）
```css
.tag {
  font-family: var(--font-jp);
  font-size: 10px;
  padding: 1px 6px 2px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}
.tag::before {
  content: '';
  width: 4px; height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}
/* 各色定義 */
.tag-person    { color: #7eb8f7; background: rgba(126,184,247,0.10); border: 1px solid rgba(126,184,247,0.20); }
.tag-landscape { color: #68d9a4; background: rgba(104,217,164,0.10); border: 1px solid rgba(104,217,164,0.20); }
.tag-favorite  { color: #d97ee8; background: rgba(217,126,232,0.10); border: 1px solid rgba(217,126,232,0.20); }
.tag-action    { color: #f07070; background: rgba(240,112,112,0.10); border: 1px solid rgba(240,112,112,0.20); }
.tag-daily     { color: #a07af0; background: rgba(160,122,240,0.10); border: 1px solid rgba(160,122,240,0.20); }
```

---

## 每次改完記得
1. `npm run build` 確認編譯
2. `cargo check`（若改了 Rust）
3. 版本號 +0.01（手動改 `tauri.conf.json` title 中的版號）
4. `git add` 相關檔案 → `git commit` → `git push`

## 參考檔案
- `mockup.html` — 視覺標準，直接用瀏覽器開啟對照
- `src/themes.css` — token 來源
- `src/style.css` — 全域基底樣式
