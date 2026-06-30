# Custom Tag Preview Software

本地桌面應用程式，以**標籤系統**取代傳統資料夾分類，管理大量檔案（壓縮包、圖片、影片等），並提供即時縮圖預覽與批次操作。基於 **Tauri v2 (Rust) + Vue 3** 建構，無需伺服器，所有資料完全本地儲存。

![版本](https://img.shields.io/badge/version-v0.80-amber)
![平台](https://img.shields.io/badge/platform-Windows-blue)
![框架](https://img.shields.io/badge/Tauri-v2-purple)

---

## 功能概覽

### 來源目錄管理
- 新增多個來源目錄（Source），支援獨立開關與刪除
- 左側樹狀導航，逐層瀏覽資料夾
- 資料夾可指定**自訂類別**（icon、顏色、副檔名規則、自動標籤規則）

### 標籤系統
- 新增、重新命名、刪除、上色標籤
- **多標籤 AND 篩選**：點選多個標籤，列出同時包含所有標籤的項目
- **標籤規則**：依路徑 prefix / suffix / contains / regex 自動套用
- 批次貼標籤 / 移標籤（Ctrl / Shift 多選後操作）

### 瀏覽與預覽
- **列表檢視**：可排序欄位（檔名、大小、日期）、欄位顯示開關（縮圖／標籤／大小／日期）、虛擬捲動支援大量項目
- **縮圖格子**：IPC 非同步載入封面圖，支援 ZIP/CBZ/CBR 封面擷取與圖片直接預覽
- 右側預覽面板：封面大圖、標籤列表、元資料、開啟檔案按鈕
- 全文搜尋（檔名、標籤、備注），支援高亮顯示

### 批次操作
- 批次加標籤 / 移標籤
- 批次移至資源回收筒
- 右鍵選單：進入資料夾、修改類別、套用標籤規則、改檔名、刪除

### 掃描 / 同步
- **全量掃描**：清除後重建資料庫
- **增量掃描**：僅處理新增 / 移除的項目
- **掃描精靈**：批次對所有來源執行同步，附進度列

### 重複檔案偵測
- 以檔案指紋（hash）偵測重複群組
- 一鍵保留最新 / 移除重複

### 其他
- 檔案重新命名（同步寫回磁碟，未掃描項目自動匯入後再命名）
- 縮圖快取（JPEG，`app_data/comic_cache/`）
- 四套主題風格，持久化記憶選擇

---

## 主題

| 主題 | 代號 | 特色 |
|------|------|------|
| Obsidian · Amber | `obsidian` | 深黑 + 琥珀金（預設） |
| Forge · Industrial | `forge` | 深灰 + 橙紅工業風 |
| Parchment · Archive | `parchment` | 米黃暖色復古風 |
| Phosphor · Terminal | `phosphor` | 純黑 + 螢光綠終端機風 |

---

## 技術棧

| 層 | 技術 |
|----|------|
| 桌面框架 | [Tauri v2](https://v2.tauri.app/) (Rust) |
| 前端 | [Vue 3](https://vuejs.org/) + Vite + TypeScript |
| 狀態管理 | [Pinia](https://pinia.vuejs.org/) |
| 資料庫 | SQLite + [sqlx](https://github.com/launchbadge/sqlx) |
| 樣式 | Vanilla CSS + CSS Design Tokens（4 主題系統） |

---

## 開發

### 環境需求

- [Node.js](https://nodejs.org/) 18+
- [Rust 工具鏈](https://www.rust-lang.org/)（`rustup` 安裝）
- Windows：需安裝 [C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

### 安裝依賴

```powershell
npm install
```

### 開發模式

```powershell
npm run tauri:dev
```

### 打包發佈

```powershell
npm run tauri:build
```

`npm run tauri:build` 會先停止已啟動的本專案 Tauri app 或 dev server，再開始打包。產出安裝檔位於 `src-tauri/target/release/bundle/`。

---

## 專案結構

```
src/
  components/           # UI 元件
    ActivityBar.vue     # 側邊導航 + 主題切換
    ItemGallery.vue     # 主畫面（列表/格子切換、多選、批次操作）
    FileExplorerTable.vue  # 列表檢視（虛擬捲動、欄位設定）
    ThumbnailGridView.vue  # 縮圖格子檢視
    TagSidebar.vue      # 標籤篩選側欄
    PreviewPane.vue     # 右側預覽面板
    ItemDetailModal.vue # 詳情 / 標籤編輯 Modal
    DuplicateView.vue   # 重複檔案偵測
    ScanWizardModal.vue # 掃描精靈
    ...
  composables/          # 共用邏輯
  stores/
    themeStore.ts       # 主題管理（Pinia）
  api.ts                # Tauri IPC 封裝層
src-tauri/src/
  commands.rs           # Tauri command 實作（前後端橋接）
  db.rs                 # 資料庫初始化與 migration
  models.rs             # 資料結構定義
  scanner.rs            # 目錄掃描 / 縮圖產生
  zip_utils.rs          # ZIP/CBZ 封面擷取
scripts/
  stamp-build.cjs       # 自動更新版本號 + build 時間戳
src-tauri/
  app-icon.svg          # 應用程式圖示原始檔（512×512 SVG）
  icons/                # 各平台尺寸圖示（由 tauri icon 生成）
```

---

## 授權

私有專案，未經授權不得轉載或商業使用。
