# 自定義標籤預覽軟體 (Custom Tag Preview Software)

本地桌面應用程式，用於管理大量檔案（壓縮包、圖片、影片等），以標籤系統取代傳統資料夾分類，提供快速預覽與批次操作。基於 **Tauri v2 (Rust) + Vue 3** 建構，無需伺服器，資料完全本地。

## 功能

### 來源管理
- 新增多個來源目錄（Source），自動同步新增/移除的檔案
- 樹狀圖導航，支援資料夾逐層瀏覽
- 資料夾可設定**自訂類別**（含圖示、顏色、副檔名規則）

### 標籤系統
- 手動新增、重新命名、刪除標籤
- **多標籤 AND 篩選**：點選多個標籤，結果同時包含所有選定標籤
- 標籤規則：依路徑 prefix/suffix/contains/regex 自動套用
- 批次貼標籤 / 移標籤（多選後操作）

### 瀏覽與預覽
- 列表檢視 / 縮圖格子檢視（可切換）
- 右側預覽面板（可調整寬度）
- Ctrl/Shift 多選，批次刪除（移至資源回收筒）

### 批次操作（多選後顯示）
- 批次**加標籤**：搜尋標籤後一鍵套用
- 批次**移標籤**：列出聯集標籤，點選移除
- 批次移至資源回收筒

### 掃描 / 同步
- 全量掃描：清除後重建資料庫
- 增量掃描：僅處理新增 / 移除的項目
- 批次掃描精靈：一次對所有來源執行同步

### 其他
- 檔案重新命名（同步磁碟）
- 縮圖快取（JPG，`app_data/comic_cache/`）
- 深色主題 Glassmorphism UI

## 技術棧

| 層 | 技術 |
|----|------|
| 桌面框架 | [Tauri v2](https://v2.tauri.app/) (Rust) |
| 前端 | [Vue 3](https://vuejs.org/) + Vite + TypeScript |
| 資料庫 | SQLite + [sqlx](https://github.com/launchbadge/sqlx) |
| 樣式 | Vanilla CSS (Glassmorphism) |

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
npm run tauri dev
```

### 打包發佈
```powershell
npm run tauri build
```
產出安裝檔位於 `src-tauri/target/release/bundle/`。

## 專案結構

```
src/                  # Vue 3 前端
  components/         # UI 元件
  composables/        # 共用邏輯（useToast、useTagManager、useItemTypes）
  api.ts              # Tauri IPC 封裝
src-tauri/src/        # Rust 後端
  commands.rs         # Tauri command 實作
  db.rs               # 資料庫初始化與 migration
  models.rs           # 資料結構定義
  scanner.rs          # 目錄掃描 / 縮圖產生
  zip_utils.rs        # ZIP 封面擷取
scripts/
  stamp-build.cjs     # 自動更新版本號 + build 時間戳
```

## 授權

私有專案，未經授權不得轉載或商業使用。
