# 常用項目模式設計

## 目標

加入一個「常用」模式，讓使用者能快速看到曾經被主動打開過的項目。這個模式不是標籤，也不是獨立資料夾，而是目前檔案瀏覽器的一個檢視切換。

## 名稱

- UI 按鈕名稱：常用
- Tooltip：顯示常用項目
- 資料欄位：`openCount`
- 需要顯示數字時：開啟 12 次

## 打開次數定義

以下行為會增加 `openCount`：

- 進入播放/閱讀模式。
- 使用系統開啟檔案。

以下行為不會增加 `openCount`：

- 單純點選項目。
- 多選項目。
- 開啟預覽面板。
- 編輯標籤、分類、備註或 metadata。

## 資料模型

在 `items` 表新增 `open_count INTEGER NOT NULL DEFAULT 0`。既有資料升級後都是 0。

前後端 `Item` 型別新增 `openCount`。前端的 `FileItem` 可以不直接持有此欄位；在檔案系統瀏覽模式下，常用排序與過濾可透過 `itemByPath` 找到對應的 DB item，再讀取 `openCount`。

為了讓未匯入但可開啟的檔案也能被記錄，打開時使用 path-based command，例如 `record_item_open(path)`。這個 command 會確保 item 存在後再把 `open_count` 加 1。

## UI 行為

在 Gallery toolbar 右側，靠近列表/縮圖切換的位置新增一個「常用」圖示按鈕。

按鈕開啟時：

- 只顯示 `openCount > 0` 的項目。
- 依 `openCount` 由高到低排序。
- 若開啟次數相同，沿用名稱排序作為穩定排序。
- 0 次項目不顯示。
- 搜尋框仍可在常用結果內縮小範圍。

按鈕關閉時：

- 回到原本列表。
- 回到原本排序欄位與方向。
- 原本的列表/縮圖檢視狀態不被改掉。

## 空狀態

如果常用模式開啟後沒有任何 `openCount > 0` 的項目，顯示簡短空狀態：

「還沒有常用項目」

不需要新增說明文字或教學段落。

## 資料流

1. 使用者點「播放/閱讀」或系統開啟。
2. 前端呼叫 `recordItemOpen(path)`。
3. 後端確保該 path 有對應 item row。
4. 後端執行 `open_count = open_count + 1`。
5. 前端重新載入 gallery 資料或局部更新目前項目的 `openCount`。
6. 常用模式依最新 `openCount` 顯示。

## 錯誤處理

計數失敗不應阻止開啟檔案或閱讀器。若打開成功但計數失敗，只在 console 記錄錯誤，不顯示 toast，避免干擾主要操作。

系統開啟失敗時不增加 `openCount`。

閱讀器只有在成功進入閱讀模式後才增加 `openCount`。

## 測試範圍

前端測試：

- 常用模式只保留 `openCount > 0`。
- 常用模式依 `openCount` 高到低排序。
- 關閉常用模式後回到原排序。
- 搜尋會套用在常用結果內。
- 播放/閱讀成功後會呼叫 `recordItemOpen`。
- 系統開啟成功後會呼叫 `recordItemOpen`。

後端測試：

- `init_db` 會建立或補上 `open_count` 欄位。
- `record_item_open(path)` 會把 existing item 的 `open_count` 加 1。
- `record_item_open(path)` 能處理尚未匯入但存在於磁碟的檔案。
- `get_items` 回傳的 `Item` 包含 `openCount`。

## 不納入本次

- 最近開啟時間。
- 常用項目的獨立側邊欄分類。
- 手動重置開啟次數。
- 前 10% 排行榜模式。
- 依時間衰退的使用權重。
