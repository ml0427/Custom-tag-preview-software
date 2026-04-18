# 專案交接與開發筆記 (Handover Notes)

這份文件用於記錄目前的系統架構、已完成進度與未來接手的開發重點，方便後續 AI 或是開發人員能夠無縫接軌。

## 1. 系統環境與技術棧
* **前端 (Client)**：
  - 目錄：`client/`
  - 框架：Vue 3 + Vite + TypeScript
  - 啟動方式：`npm run dev` (搭配 `start.bat` 一鍵啟動)
* **後端 (Server)**：
  - 目錄：`server/`
  - 框架：Spring Boot 3.4.2 (Java 17)
  - 資料庫：SQLite (`server/comic.db`)
  - ORM：Spring Data JPA + Hibernate (DDL Auto: update)
  - 啟動方式：`.\mvnw spring-boot:run` (搭配 `start.bat` 一鍵啟動)
* **實體存放區** (皆位於 `server/` 底下)：
  - `comic_storage/`：存放來源 ZIP 漫畫檔。
  - `comic_cache/`：存放從 ZIP 中提取出來的封面快取圖片。

## 2. 已完成進度 (Stage 1 ~ 5)
1. **環境建置**：前後端基礎專案結構已建立，完成 SQLite (`comic.db`) 連線設定，並在 `pom.xml` 加入 UTF-8 編碼確保跨語系相容性。
2. **資料庫設計**：建立 `Comic`, `Tag` 以及 `comic_tag_mapping` 表達成多對多關聯。
3. **核心檔案處理**：已實作 `ZipService` 提取圖片與解讀列表。
4. **掃描與快取 (Stage 3)**：
   - 實作了 `ComicScannerService`：原本為排程模式，後改為接收 `/api/comics/scan` 手動觸發，掃描指定路徑下的 ZIP 檔並寫入新漫畫。
   - 實作了 `ComicCacheService`：非同步 `@Async` 提取 ZIP 中第一張圖並另存進 `server/comic_cache/{id}.jpg` 完成快取任務。
5. **後端 API 服務 (Stage 4)**：
   - 實作 DTO 模式避免遞迴，並在 `WebConfig` 開通全域 `@CrossOrigin`。
   - 實作 `ComicController`, `TagController`, `ImageController` 以提供分頁、標籤過濾、寫入/關聯標籤、靜態圖片回傳與封面重新提取功能。
6. **前端畫廊介面 (Stage 5)**：
   - 使用 Vue 3 + Vite 開發介面。
   - 包含組件：`TagSidebar` (側邊篩選與手動掃描功能), `ComicGallery` (網格展示漫畫清單), `ComicCard` (懸停動畫與標籤顯示), `ComicDetailModal` (彈出視窗並處理自訂封面與標籤增刪)。
7. **一鍵啟動**：在專案根目錄建立了 `start.bat` 與 `啟動說明.md`，可獨立且快速地同時帶起前後端伺服器。

## 3. 下一步開發重點 (未來接手指南)
這個專案的五大核心階段已經全數完工，具備完整的本地 ZIP 漫畫管理能力。接手的開發人員可往以下方向精進：
1. **效能優化**：針對上千本巨大的收藏，可考慮在 SQLite 添加索引或實作進階的分頁快取與懶加載機制 (Lazy Loading)。
2. **桌面應用打包**：將前後端包裹進 Electron，實現純粹的桌面應用程式體驗，無須仰賴瀏覽器。

## 5. 未來升級任務列表 (Future Upgrade Missions)
依照使用者需求規畫的核心階段，建議按順序分次執行：

### **Mission 1: 檔案總管式介面改版 (UI/UX Overhaul)**
*   **目標**：將 Grid 佈局改為「詳細資料列表」+「右側預覽窗格」。
*   **內容**：
    *   `ComicGallery.vue`: 改用表格呈現名稱、修改日期、大小、標籤。
    *   `PreviewPane`: 新增組件，側邊顯示選中檔案的封面與標籤細節。

### **Mission 2: 本地檔案互動功能 (Desktop Integration)**
*   **目標**：雙擊清單項目直接開啟本地 ZIP 檔案。
*   **內容**：
    *   Backend: 新增 `/api/comics/{id}/open` 接口，調用系統預設程式。
    *   Frontend: 實作 `dblclick` 雙擊開啟功能。

### **Mission 3: 進階標籤管理系統 (Dynamic Tag System)**
*   **目標**：去下拉化，實現自填式標籤管理。
*   **內容**：
    *   `ComicDetailModal.vue`: 實作文字輸入式標籤（點擊刪除，回車新增）。
    *   `TagSidebar.vue`: 在側邊欄直接支援標籤的重命名與刪除。

### **Mission 4: 系統偏好設定持久化 (Persistent Config)**
*   **目標**：自動記憶掃描路徑。
*   **內容**：
    *   Backend: 儲存 Last Success Path 到資料庫或設定檔。
    *   Frontend: 自動填充路徑輸入框。
