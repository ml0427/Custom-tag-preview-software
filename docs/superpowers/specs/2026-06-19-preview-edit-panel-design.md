# 預覽側欄整合編輯功能設計

## 背景

目前檔案與資料夾的日常編輯分散在三個主要 modal：

- `ItemDetailModal.vue`：檔案標籤、封面、壓縮包內容預覽與 metadata 查詢入口。
- `FolderDetailModal.vue`：資料夾名稱、備註、標籤、預設標籤規則集與操作。
- `ItemCategoryModal.vue`：檔案類別設定與套用對應標籤規則。

`PreviewPane.vue` 目前只顯示封面、metadata、標籤與備註，並用「編輯」按鈕再打開上述 modal。這會讓預覽和編輯成為兩套工作區。新的設計要拿掉主要編輯頁面，把日常編輯收進右側預覽側欄。

## 使用者確認的方向

- 採用「資訊 / 編輯」分段切換。
- 預覽側欄仍保留乾淨的資訊瀏覽狀態。
- 切到「編輯」後才顯示可修改欄位。
- `MetadataLookupModal` 不放進預覽側欄，改由項目右鍵選單開啟。
- 技術取捨由實作者自行處理，使用者只確認操作心智模型與功能範圍。

## 功能範圍

### 預覽資訊分段

資訊分段維持目前 `PreviewPane` 的核心用途：

- 顯示封面或資料夾代表圖。
- 顯示名稱、大小、修改日期。
- 顯示既有標籤，並保留點標籤跳到標籤篩選的行為。
- 顯示備註。
- 提供檔案「開啟」操作。

### 預覽編輯分段

編輯分段承接日常小編輯：

- 檔案與資料夾都可編輯顯示名稱。
- 檔案與資料夾都可新增或移除標籤。
- 資料夾可編輯備註。
- 檔案可修改類別，並沿用目前「儲存類別後自動套用對應標籤規則」行為。
- 資料夾可設定、清除、立即套用預設標籤規則集。
- 檔案若是可列內部圖片的壓縮包，保留內容預覽與「設為封面」能力。

不把 metadata 查詢放在預覽編輯分段，避免把一次性外部查詢工作流塞進日常側欄。

### 右鍵 Metadata 查詢

list view 與 thumbnail view 的右鍵選單都新增 metadata 查詢入口。

行為：

- 對已匯入項目，直接開啟 `MetadataLookupModal`。
- 對未匯入項目，先沿用現有 quick import，再開啟 `MetadataLookupModal`。
- 檔案與資料夾都支援入口；實作不可因類型先隱藏 metadata 查詢入口。
- 套用 metadata tags 後刷新目前 gallery、預覽資料與全域標籤資料。

## 技術設計

### 元件責任

- `PreviewPane.vue`：管理「資訊 / 編輯」分段、封面載入、資訊顯示、把更新事件往上拋。
- 新增 `PreviewEditPanel.vue`：管理日常編輯 UI 與 API 呼叫，依 item type 顯示檔案或資料夾欄位。
- `MetadataLookupModal.vue`：保留現有大型彈窗，不搬入預覽側欄。
- `ItemGallery.vue`：管理選取項目、預覽側欄開啟、切換到編輯分段、metadata lookup modal 的目前 item。
- `FileExplorerTable.vue` 與 `ThumbnailGridView.vue`：新增右鍵 metadata lookup 事件。
- `App.vue`：移除主要編輯 modal state 與掛載，只保留 gallery refresh、tag refresh 與全域資料同步。

### 資料更新規則

- 標籤新增或移除後，刷新 gallery 與全域 tags。
- metadata tags 套用後，刷新 gallery、目前預覽 item 與全域 tags。
- 名稱、備註、分類、封面、資料夾規則變更後，刷新 gallery 並重新抓目前 item。
- 右鍵 metadata lookup 若 quick import 成功，modal 必須使用匯入後的 DB item；套用後刷新該 item 所在 gallery 與全域 tags。

### 入口調整

原本會打開主要編輯 modal 的入口改為：

- 選取該項目。
- 開啟右側預覽側欄。
- 切到「編輯」分段。

受影響入口包含：

- `PreviewPane` 原本的「編輯」按鈕。
- list view 右鍵「編輯標籤」「詳情/編輯標籤」「修改類別」。
- thumbnail view 右鍵「編輯標籤」「詳情/編輯標籤」「修改類別」。
- 任何 `showDetail`、`showFolderDetail`、`showCategoryEditor` 事件鏈。

## 風險與約束

- `PreviewPane` 不應承接所有 API 細節；日常編輯要拆到新元件，避免側欄元件變成巨型檔案。
- 右側側欄寬度有限，欄位必須可捲動，input/select 在 flex 或 grid 內要設定 `min-width: 0`。
- `MetadataLookupModal` 是重流程，保留為獨立 modal；這是刻意設計，不代表主編輯頁仍存在。
- 不刪除舊 modal 檔案本身，除非實作後確認完全沒有引用且刪除不增加風險。主要目標是移除主要入口與掛載。
- 若實作中發現舊 modal 仍有難以安全搬移的能力，應優先抽可重用邏輯或元件，不要複製大量分歧行為。

## 驗證

實作完成後至少驗證：

- `npm run build` 通過。
- list view 與 thumbnail view 都能從右鍵開 metadata 查詢。
- metadata 套用 tag 後，預覽、列表與 TagSidebar 都更新。
- 點舊的詳情或分類入口後，不再打開主要編輯 modal，而是開啟預覽側欄並切到編輯分段。
- 檔案編輯分段顯示名稱、標籤、分類、封面相關能力。
- 資料夾編輯分段顯示名稱、備註、標籤、資料夾規則能力。
- 預覽資訊分段仍能正常顯示封面、metadata、標籤與備註。
