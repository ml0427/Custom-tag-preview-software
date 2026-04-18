# 自定義標籤預覽軟體 (Custom Tag Preview Software)

這是一款專為漫畫與同人誌檔案開發的預覽與管理軟體。從原本的 Spring Boot + Java 架構全面遷移至 **Tauri v2 (Rust) + Vue 3**，實現更輕量化、更快速的原生桌面體驗。

## 🌟 核心功能

- **🚀 自動掃描與擷取**：自動掃描指定目錄下的 ZIP 壓縮檔，並透過正則表達式自動提取作者、社團與作品名稱。
- **🖼️ 即時預覽**：直接從壓縮檔中提取第一頁作為封面，採用 Base64 同步載入技術，無需生成實體快取檔，隱私且高效。
- **🏷️ 標籤管理**：完整的標籤系統，支援手動新增、刪除以及與作品的關聯管理。
- **📝 檔案重新命名**：支援在軟體內直接修改作品標題，並同步重新命名磁碟上的檔案。
- **🔍 篩選與分頁**：支援按標籤篩選作品，並提供極致流暢的分頁瀏覽體驗。
- **📂 本地數據庫**：使用 SQLite (sqlx) 存儲所有數據，確保數據安全且不依賴外部伺服器。

## 🛠️ 技術棧

- **後端**: [Tauri v2](https://v2.tauri.app/) (Rust)
- **前端**: [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/) + TypeScript
- **資料庫**: [SQLite](https://sqlite.org/) + [sqlx](https://github.com/launchbadge/sqlx)
- **樣式**: Vanilla CSS (Premium Glassmorphism Design)

## 🚀 開發與建構

### 環境準備
確保您的電腦已安裝：
- [Node.js](https://nodejs.org/)
- [Rust 工具鏈](https://www.rust-lang.org/)
- Windows 使用者需安裝 [C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

### 安裝依賴
```powershell
npm install
```

### 開發模式
```powershell
npm run tauri dev
```

### 打包發佈 (Production)
```powershell
npm run tauri build
```
打包後的安裝檔位於 `src-tauri/target/release/bundle/`。

## 📁 專案結構
- `src/`: Vue 3 前端原始碼、API 定義以及全螢幕毛玻璃風格 UI。
- `src-tauri/`: Rust 後端邏輯，包含資料庫遷移、ZIP 處理與檔案掃描。
- `tauri.conf.json`: Tauri 配置文件。

## 📄 授權
本專案為私有開發。

---
*Powered by Antigravity Agentic AI*
