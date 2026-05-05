# Custom Tag Preview — 專案 Wiki

> 由 GitNexus 知識圖譜 + Claude 生成 · 1108 符號 · 1655 關係 · 33 執行流程

---

## 目錄

1. [專案概覽](#1-專案概覽)
2. [技術架構](#2-技術架構)
3. [資料模型](#3-資料模型)
4. [前端架構](#4-前端架構)
5. [後端架構](#5-後端架構)
6. [主題系統](#6-主題系統)
7. [核心執行流程](#7-核心執行流程)
8. [API 層](#8-api-層)
9. [功能模組地圖](#9-功能模組地圖)

---

## 1. 專案概覽

**Custom Tag Preview** 是一款 Windows 桌面應用程式，用於管理本地檔案的自訂標籤、類別與預覽。核心功能：

- 監控多個來源目錄，自動掃描檔案
- 依類別規則自動套用標籤
- Gallery 檢視（清單 / 縮圖格）
- 重複檔案偵測（SHA 指紋比對）
- 4 種主題風格

---

## 2. 技術架構

```
custom-tag-preview/
├── src/                        # Vue 3 前端
│   ├── App.vue                 # 根元件、全域狀態
│   ├── api.ts                  # Tauri invoke 封裝
│   ├── style.css               # 全域樣式
│   ├── themes.css              # 4 主題 CSS 變數
│   ├── components/             # UI 元件 (26 個)
│   ├── composables/            # Vue composables (28 符號)
│   ├── stores/                 # Pinia stores
│   └── router/                 # Vue Router
└── src-tauri/
    └── src/
        ├── main.rs             # 應用入口、Tauri 設定
        ├── commands.rs         # 所有 Tauri 指令
        ├── db.rs               # SQLite CRUD
        ├── scanner.rs          # 檔案掃描引擎
        └── models.rs           # 資料結構定義
```

| 層級 | 技術 |
|------|------|
| 桌面框架 | Tauri v2 |
| 前端 | Vue 3 + TypeScript + Vite |
| 狀態管理 | Pinia |
| 後端 | Rust |
| 資料庫 | SQLite（透過 rusqlite） |

---

## 3. 資料模型

### 核心實體（`models.rs`）

| 實體 | 說明 | 關鍵欄位 |
|------|------|---------|
| `Source` | 監看的根目錄 | `id`, `path` |
| `Folder` | DB 中登記的子目錄 | `id`, `path`, `name`, `category`, `tags` |
| `Item` | 單一檔案 | `id`, `path`, `name`, `fingerprint`, `cover`, `tags` |
| `Tag` | 標籤 | `id`, `name`, `color` |
| `ItemType` | 類別（含規則） | `id`, `name`, `icon`, `tag_rules` |
| `TagRule` | 自動標記規則 | `pattern`, `tag_name`, `match_type` |

### 關聯關係

```
Source ──< Folder ──< Item
                       │
Tag >──< item_tags ───┘
Tag >──< folder_tags ──< Folder
ItemType ──< TagRule
```

---

## 4. 前端架構

### App.vue — 全域狀態

```
activePanel          當前面板 (workspace | tags | duplicates)
selectedSourcePath   已選取的來源路徑
selectedTagIds       篩選用的標籤 ID 陣列
selectedFileItem     開啟詳細的檔案
selectedFolderItem   開啟詳細的資料夾
allTags              全域標籤清單
scanProgress         掃描進度 (Tauri 事件驅動)
```

### 元件總覽

| 元件 | 職責 |
|------|------|
| `ActivityBar.vue` | 左側導覽列 + 主題切換 |
| `SourcePanel.vue` | 來源目錄樹 + 資料夾管理 |
| `TagSidebar.vue` | 標籤篩選面板 |
| `ItemGallery.vue` | 主內容區（清單 / 格狀切換） |
| `FileExplorerTable.vue` | 清單視圖 + 排序 + 行內重新命名 |
| `ThumbnailGridView.vue` | 縮圖格狀視圖 |
| `ThumbnailCard.vue` | 單一縮圖卡片 |
| `GalleryToolbar.vue` | 搜尋、排序、視圖切換工具列 |
| `GalleryInfoBar.vue` | 顯示項目數 + 篩選摘要 |
| `ItemDetailModal.vue` | 檔案詳細 + 標籤編輯 |
| `FolderDetailModal.vue` | 資料夾詳細 + 標籤編輯 |
| `DuplicateView.vue` | 重複檔案瀏覽器 |
| `PreviewPane.vue` | 側邊預覽 |
| `MediaViewer.vue` | 全螢幕媒體播放 |
| `MetadataPanel.vue` | 檔案 metadata 顯示 |
| `TagItem.vue` | 標籤 chip |
| `TagEditorField.vue` | 標籤輸入 + 自動完成 |
| `TagColorPicker.vue` | 標籤顏色選擇 |
| `ScanWizardModal.vue` | 標籤規則精靈 |
| `CategoryManageModal.vue` | 類別管理 |
| `CategoryEditor.vue` | 類別規則編輯器 |
| `TagRuleEditor.vue` | 單條規則編輯器 |
| `LocalDirTree.vue` | 目錄樹 |
| `DirTreeNode.vue` | 樹節點 |
| `DetailFormLayout.vue` | 詳細表單排版 |
| `ToastContainer.vue` | 通知 Toast |

### Composables（`src/composables/`）

| Composable | 職責 |
|-----------|------|
| `useGalleryData` | 項目載入、過濾、分頁、排序 |
| `useDuplicateScanner` | 重複偵測，回傳 `DuplicateGroup[]` |
| `useTagManager` | 標籤 CRUD（適用 item / folder） |
| `useItemTypes` | 類別清單管理 |

### Stores（`src/stores/`）

| Store | 職責 |
|-------|------|
| `themeStore` | 主題切換（obsidian/forge/parchment/phosphor），持久化至 localStorage |

---

## 5. 後端架構

### main.rs — 應用入口

- 建立 Tauri builder
- 設定 SQLite 路徑（`AppData\Roaming`）
- 執行 `init_db()` 初始化 schema
- 註冊所有 Tauri 指令
- 暴露主題驗證流程（`IsValidTheme` → `SetTheme`）

### commands.rs — 指令集

| 群組 | 指令 |
|------|------|
| 來源 | `sync_sources`, `add_source`, `remove_source`, `get_sources` |
| 項目 | `get_items`, `get_item`, `rename_item`, `untrack_item` |
| 標籤 | `add_tag`, `rename_tag`, `delete_tag`, `get_tags` |
| 標籤關聯 | `add_tag_to_item`, `remove_tag_from_item`, `add_tag_to_folder`, `remove_tag_from_folder` |
| 類別 | `get_item_types`, `create_item_type`, `update_item_type`, `delete_item_type` |
| 掃描 | `scan_directory`, `incremental_scan`, `apply_tag_scan`, `preview_tag_scan`, `reapply_all_category_rules` |
| 重複 | `compute_fingerprints`, `get_duplicate_groups` |

### scanner.rs — 掃描引擎

| 函式 | 職責 |
|------|------|
| `compute_file_fingerprint()` | SHA 指紋計算（重複偵測基礎） |
| `process_folder()` | 掃描資料夾，建立 / 更新 Item 記錄 |
| `process_zip_file()` | 處理 ZIP 壓縮檔，萃取封面 |
| `extract_and_apply_tags()` | 依 TagRule 自動套用標籤 |
| `apply_rules_to_name()` | 用規則比對檔名 |
| `extract_image()` | 萃取縮圖 / 封面圖 |
| `is_image_file()` | 圖片類型判斷 |

### db.rs — 資料庫層

- `init_db()` — 建立 SQLite schema（tables: sources, folders, items, tags, item_tags, folder_tags, item_types）
- 所有實體的 CRUD 函式
- 標籤 ↔ 項目 / 資料夾 的關聯操作

---

## 6. 主題系統

4 個主題定義在 `src/themes.css`，切換方式：`:root[data-theme="X"]`。

| 主題 ID | 風格 | Accent 色 | 背景 |
|---------|------|-----------|------|
| `obsidian`（預設） | 火山琥珀精準 | `#f0b429` 琥珀 | `#060609` 近黑 |
| `forge` | 熔鑄工業邊緣 | `#ff6b35` 橙 | `#0c0d0f` 炭黑 |
| `parchment` | 暖色手稿檔案（**唯一淺色**） | `#b0431e` 磚紅 | `#f0e9dc` 米色 |
| `phosphor` | 綠色 CRT 終端 | `#00ff41` 磷光綠 | `#020604` 純黑 |

儲存路徑：`themeStore` → localStorage → `data-theme` attribute。

---

## 7. 核心執行流程

### 7.1 來源同步（Sync Sources）

```
SourcePanel.handleAddSource()
  → api.addSource(path)            # 寫入 sources 表
  → api.syncSources()
    → commands::sync_sources()
      → 遍歷所有 Source
        → scanner::process_folder()
          → compute_file_fingerprint()   # 重複偵測
          → extract_image()              # 縮圖
          → extract_and_apply_tags()     # 自動標籤
      → emit('scan-progress', ...)       # 進度事件 → App.vue 顯示進度條
```

### 7.2 自動標籤掃描（Apply Tag Scan）

```
SourcePanel.submitFolderModal()
  → api.applyTagScan(path, tagRules)
    → commands::apply_tag_scan()
      → 遍歷資料夾內所有 Item
        → apply_rules_to_name(filename, rules)
          → 規則比對（前綴 / 後綴 / 包含 / 正規）
        → db::add_tag_to_item()         # 符合則套用標籤
```

### 7.3 重複偵測（Duplicate Detection）

```
DuplicateView 掛載
  → useDuplicateScanner.scan()
    → api.computeFingerprints()         # 計算所有 Item 的 SHA
    → api.getDuplicateGroups()          # 相同指紋分組
      → 回傳 DuplicateGroup[]
```

### 7.4 重新命名（Rename Item）

```
FileExplorerTable / ThumbnailCard
  → commitRename(newName)
    → api.renameItem(id, newName)
      → commands::rename_item()
        → 驗證新名稱不重複
        → fs::rename() 實際改名
        → db::update_item_path()       # 同步 DB 記錄
        → db::fetch_item_tags()        # 回傳最新資料
```

### 7.5 主題初始化（App Startup）

```
main() (Rust)
  → init_db()
  → register_commands()
  → window created

themeStore.init() (Vue)
  → 讀 localStorage
  → document.documentElement.setAttribute('data-theme', ...)
```

---

## 8. API 層

`src/api.ts` 是前端與 Rust 後端之間的唯一橋接層，所有呼叫透過 `invoke()` 發送。

### 主要 API 方法

```typescript
// 來源
api.getSources()
api.addSource(path)
api.removeSource(id)
api.syncSources()

// 項目
api.getItems(sourcePath, tagIds?, search?, sort?)
api.getItem(id)
api.renameItem(id, newName)
api.untrackItem(path)

// 標籤
api.getTags()
api.addTag(name, color)
api.renameTag(id, newName)
api.deleteTag(id)
api.addTagToItem(itemId, tagName)
api.removeTagFromItem(itemId, tagId)

// 掃描
api.previewTagScan(path, rules)
api.applyTagScan(path, rules)
api.reapplyAllCategoryRules()

// 重複
api.computeFingerprints()
api.getDuplicateGroups()
```

---

## 9. 功能模組地圖

GitNexus 分析出的 8 個功能群集：

| 群集 | 符號數 | 內聚度 | 主要內容 |
|------|--------|--------|---------|
| Composables | 28 | 100% | 所有 Vue composables |
| Cluster_49 | 12 | 93% | 指紋計算、ZIP 處理、DB 工具 |
| Cluster_50 | 7 | 86% | 掃描流程核心（process_folder, extract_and_apply_tags, add_tag_to_item） |
| Cluster_58 | 7 | 92% | Tag scan 指令（apply_tag_scan, preview_tag_scan, apply_rules_to_name） |
| Stores | 6 | 100% | Pinia stores + DB 初始化 + main.rs |
| Cluster_51 | 5 | 73% | 來源同步指令群 |
| Cluster_54 | 5 | 62% | 重新命名流程 |
| Cluster_55 | 5 | 62% | 資料夾 tag 管理 |

---

*Generated by Claude (claude-sonnet-4-6) via GitNexus MCP · 2026-05-05*
