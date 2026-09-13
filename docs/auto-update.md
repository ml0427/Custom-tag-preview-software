# 自動更新與安裝版發佈

本專案使用 Tauri 2 官方 updater，從此儲存庫的 GitHub Releases 取得 `latest.json`，下載並驗證安裝包簽章後更新。Windows 使用 NSIS 安裝包及 passive 安裝模式。

## 第一次從 app.exe 改用安裝版

1. 關閉目前的 app.exe，執行 `comic-manager_0.146.0_x64-setup.exe` 安裝。
2. 後續使用安裝程式建立的捷徑啟動，原本的獨立 app.exe 不會被更新。
3. 在「設定 → 系統與診斷 → 自動更新」查看版本、手動檢查或關閉啟動檢查。

應用程式識別碼仍是 `com.comic.manager.software`，資料庫與縮圖仍使用原本的 Tauri app data 目錄，因此在同一個 Windows 使用者下沿用既有資料。安裝與更新不執行資料清除。

正式版啟動 5 秒後自動檢查。有新版時提供更新內容及「更新並重新開啟」按鈕；只有按下後才下載安裝。選擇「稍後再說」後，不再於啟動時提示同一版本，仍可在設定手動查看。網路失敗不在啟動時彈出視窗；設定頁會顯示失敗原因並可重試。開發伺服器與瀏覽器預覽不執行更新。

## 簽章金鑰

- 公鑰已寫入 `src-tauri/tauri.conf.json`。
- 本機私鑰位於 `%USERPROFILE%\.tauri\custom-tag-preview\updater.key`，位於儲存庫外且目錄權限限本機使用者與 SYSTEM。請將它另行備份到安全的位置；既有安裝版需要用同一把金鑰簽署後續版本。
- `npm run tauri:build` 會優先採用 `TAURI_SIGNING_PRIVATE_KEY`；未設定時自動使用上述本機私鑰。新電腦需還原同一把私鑰，不能任意重新產生並取代既有公鑰。
- GitHub Actions 需要 repository secret `TAURI_SIGNING_PRIVATE_KEY`，值為上述私鑰的完整內容。若金鑰有密碼，再設定 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。私鑰與密碼不可提交到 Git。

2026-09-13 已設定此儲存庫的 `TAURI_SIGNING_PRIVATE_KEY`；重新設定或移轉儲存庫時才需要執行下面的命令。

可在儲存庫根目錄以已登入的 GitHub CLI 設定簽章 secret（不會把私鑰印在畫面）：

```powershell
Get-Content -Raw "$env:USERPROFILE\.tauri\custom-tag-preview\updater.key" |
  gh secret set TAURI_SIGNING_PRIVATE_KEY --repo ml0427/Custom-tag-preview-software
```

## 發佈新版本

1. 使用 `npm run version:set -- 0.147.0` 指定正式三段式版本號；此命令同步 Tauri、npm、Cargo 與視窗標題。首個安裝版的版本是 `0.146.0`，舊版標題 `v0.145` 從此改用三段式格式。
2. 執行 `npm run version:check`，並完成測試、型別與樣式檢查及建置。
3. 提交並推送程式變更後，建立與版本完全一致的 tag，例如 `v0.147.0`，再推送該 tag。
4. `.github/workflows/release.yml` 會測試、編譯、簽署 NSIS 安裝包，將安裝包、`.sig` 和 `latest.json` 上傳到 Release 草稿，驗證清單後才公開發佈。
5. 只有公開的正式 Release 會成為更新來源。一般 main 推送不觸發發佈；手動重跑 Actions 時也必須選取版本 tag。使用新的遞增版本發佈，勿覆寫已公開版本的安裝包。

`.github/workflows/release.yml` 是 GitHub 的安裝包發佈設定，與本專案封存停用的 `.workflow` 無關。

## 驗證範圍

自動化測試涵蓋啟動通知、手動檢查、略過版本、偏好儲存、重複操作、下載進度、更新失敗及重啟重試；這些測試使用模擬的 Tauri API。

完整更新驗收仍需兩個不同版本的正式安裝包：安裝較舊版本、公開較新版本，實際執行檢查、下載、安裝與重開，再確認既有資料。只有本機測試與打包通過時，不能宣稱已驗證這段完整流程。第一個正式 Release 尚未公開前，檢查更新會顯示更新來源暫不可用。

參考：[Tauri updater](https://v2.tauri.app/plugin/updater/)、[Tauri GitHub Action](https://github.com/tauri-apps/tauri-action)、[MD-Forge](https://github.com/Racious/MD-Forge)。
