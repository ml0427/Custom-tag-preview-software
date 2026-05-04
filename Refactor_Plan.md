# Custom Tag Preview - 全域重構與程式碼簡化計畫 (v0.50 -> v1.0)

這份文件是對整個專案（包含前端 Vue 與後端 Rust）進行的全面架構健檢與重構指南。
**核心目標**：不改變現有功能，單純對龐大、職責不專一的檔案進行「職責分離（Separation of Concerns）」，為未來的擴充與維護打好地基。

---

## 第一部分：前端巨型組件拆分 (Frontend Component Refactoring)
*分析標準：檔案大小超過 10KB，內部包含了過多的 `v-if` 或複雜的邏輯。*

### 1. `src/components/SourcePanel.vue` (目前 ~16KB) [部分完成]
此組件身兼多職，包含了「資料庫來源庫」與「本地實體目錄樹」兩套完全獨立的邏輯。
- **重構方案**：
  - [x] 拆分出 `LocalDirTree.vue`：專職處理本地硬碟的目錄掃描與樹狀選單。
  - [ ] 拆分出 `LibraryBrowser.vue`：專職處理已匯入的資料庫來源庫切換。
  - `SourcePanel.vue` 僅保留外層容器與 Tab 切換邏輯。

### 2. `src/components/TagSidebar.vue` (目前 ~15KB) [已完成]
極度複雜，混合了樹狀結構計算、HTML5 拖曳（Drag & Drop）以及右鍵選單。
- **重構方案**：
  - [x] 抽離 `useTags.ts`：將標籤讀取與管理邏輯放入獨立 Hook。
  - [ ] 抽離 `useTagDragDrop.ts`：專職處理 D&D 事件與後端同步。（目前功能尚未完全實作）
  - [ ] 拆分 `TagContextMenu.vue`：將冗長的右鍵選單 UI 與動作獨立。
  - [x] 拆分 `TagItem.vue`：將每一個標籤節點獨立成組件。

### 3. `src/components/PreviewPane.vue` (目前 ~14KB) [已完成]
內部包含了多種不同檔案格式的渲染邏輯。
- **重構方案**：
  - [x] 拆出 `MediaViewer.vue`：處理影片 (`<video>`)、圖片 (`<img>`) 與對應的縮放/預覽。
  - [ ] 拆出 `ArchiveViewer.vue`：處理壓縮檔 (zip/rar/cbz) 的內部檔案讀取與列表。
  - [x] 拆出 `MetadataPanel.vue`：處理右側的檔案大小、路徑、修改時間等基礎資訊，以及標籤顯示區塊。

### 4. `src/components/ScanWizardModal.vue` (目前 ~14KB) [已完成]
負責複雜的掃描設定與結果預覽。
- **重構方案**：
  - [x] 拆出 `TagRuleEditor.vue`：負責前綴、後綴、正則表達式等表單設定。
  - [x] 拆出 `ScanPreviewList.vue`：負責顯示掃描進度條與模擬結果列表。

### 5. `src/components/ThumbnailGridView.vue` (目前 ~11KB) [已完成]
- **重構方案**：
  - [x] 抽離 `useThumbnailLoader.ts`：將非同步加載封面圖片、處理 Base64 的邏輯獨立。
  - [x] 拆出 `ThumbnailCard.vue`：將單一格子的 UI（包含檔名高亮、選取狀態）抽離，解決 `v-for` 內過多 HTML 的問題。

### 6. `src/components/ItemDetailModal.vue` & `FolderDetailModal.vue` (目前 ~10KB)
- **重構方案**：
  - 這兩個檔案有極高的重複性。應整合或抽離出共用的 `DetailFormLayout.vue`，統一表單排版與儲存按鈕的邏輯。

### 7. `src/components/DuplicateView.vue` (目前 ~10KB) [已完成]
- **重構方案**：
  - [x] 抽離 `useDuplicateScanner.ts`：將「計算雜湊值」、「找出重複項」、「批次保留/刪除」的純運算與狀態邏輯抽離，Vue 僅負責渲染卡片。

---

## 第二部分：後端 Rust 架構拆分 (Backend Rust Refactoring)
*分析標準：Rust 的 `main.rs` 或 `commands.rs` 塞入過多路由或邏輯。*

### 1. `src-tauri/src/commands.rs` (🚨 嚴重肥大：目前 ~46KB)
這幾乎是整個專案最大的技術債。所有的 Tauri API 端點全部塞在同一個檔案內，難以維護。
- **重構方案**：
  在 `src/` 下建立 `commands/` 目錄，將指令依據領域模型 (Domain Model) 拆分：
  - `commands/file_ops.rs`：負責檔案重新命名、刪除、讀取圖片/Zip 內容 (`open_file`, `trash_item`, `get_image_base64_by_path` 等)。
  - `commands/tag_ops.rs`：負責標籤的 CRUD、拖曳層級更新 (`create_tag`, `update_tag`, `move_tag` 等)。
  - `commands/item_ops.rs`：負責項目查詢、打標籤、批次處理 (`get_items`, `tag_item`, `untag_item` 等)。
  - `commands/category_ops.rs`：負責 ItemType (類別) 的 CRUD (`get_item_types`, `create_item_type` 等)。
  - `commands/mod.rs`：負責暴露所有指令供 `main.rs` 註冊。

### 2. `src-tauri/src/db.rs` (目前 ~12KB)
所有的 SQLite 資料庫操作都混在一起。
- **重構方案**：
  建立 `src/repository/` 目錄，透過 trait 或獨立模組拆分：
  - `repository/tag_repo.rs`
  - `repository/item_repo.rs`
  - `repository/category_repo.rs`
  讓 `db.rs` 只負責連接池 (Connection Pool) 與資料庫初始化/遷移 (Migrations)。

### 3. `src-tauri/src/scanner.rs` (目前 ~8.8KB)
- **重構方案**：
  - 將「規則匹配引擎 (Rule Matching Engine)」獨立為 `rule_engine.rs`。專門處理正則表達式、前綴、後綴的字串比對與標籤名稱推導，並補上單元測試 (`#[cfg(test)]`)，確保掃描規則不會被意外改壞。

---

## 結語與執行建議
這個計畫已經對專案的前、後端進行了地毯式的掃描。
強烈建議**先從後端的 `commands.rs` 拆分開始**，因為這是最純粹的檔案移動與模組重構，不影響邏輯；接著再依序將前端的 `PreviewPane` 與 `TagSidebar` 等組件按照上述計畫進行拆分。
