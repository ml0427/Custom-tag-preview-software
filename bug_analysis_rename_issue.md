# 修改檔名功能異常分析報告 (Bug Analysis: Item Renaming)

## 問題描述
使用者反映「修改檔名」功能失效或行為異常。經過代碼審查與邏輯追蹤，確認存在後端資料連動不完整與前端狀態不同步的設計缺陷。

---

## 核心原因分析

### 1. 資料夾重新命名的「路徑斷層」 (Critical)
**位置：** `src-tauri/src/commands.rs` -> `rename_item` 函式
**現象：** 
當重新命名一個資料夾時，程式僅更新了該資料夾在 `items` 資料表中的 `path`。然而，該資料夾下的所有子檔案與子資料夾，在資料庫中儲存的 `path` 欄位仍然是舊路徑。
**後果：**
- **資料遺失**：由於子項目路徑不匹配，下次執行「增量掃描」時，系統會認為舊路徑的檔案已刪除，新路徑的檔案是新發現的，導致**所有子項目的標籤、備註與評分全部遺失**。
- **UI 顯示異常**：在路徑篩選模式下，子項目會因為路徑前綴不符而無法被檢索出來。

### 2. 前端雙重資料源不同步 (UX/UI)
**位置：** `src/components/ItemGallery.vue` -> `handleRenamed`
**現象：**
`ItemGallery` 維持了兩個列表：`itemsData` (來自 DB) 與 `fileItems` (來自實體檔案掃描)。
目前 `handleRenamed` 成功後只更新了 `itemsData`，但 `FileExplorerTable` 在目錄瀏覽模式下是顯示 `fileItems` 的內容。
**後果：**
- 檔名在 UI 上不會立即變更，直到手動重新整理。
- `itemByPath` (以路徑為 Key 的 Map) 會因為路徑變更而找不到對應的標籤資料，導致列表上的標籤圖示消失。

---

## 預期修復方案

### 後端 (Rust)
在 `rename_item` 指令中，若 item 為資料夾，需同步更新子項目：
```rust
// 建議的修正邏輯 (commands.rs)
if extension.is_empty() { // 判定為目錄
    let old_prefix = format!("{}%", old_path_str);
    let new_prefix_base = new_path.to_string_lossy().to_string();
    
    // 同步更新所有子項目的 path
    sqlx::query("UPDATE items SET path = REPLACE(path, ?, ?) WHERE path LIKE ?")
        .bind(&old_path_str)
        .bind(&new_prefix_base)
        .bind(&old_prefix)
        .execute(&*pool).await?;
}
```

### 前端 (Vue)
在 `ItemGallery.vue` 的 `handleRenamed` 後直接觸發全量重新載入，確保所有 Map 與列表同步：
```typescript
const handleRenamed = async (updated: Item) => {
  // 強制重新載入所有資料源
  await loadAll(); 
  showToast('檔名已修改', 'success');
};
```

---
**報告日期：** 2026-05-03
**分析人員：** Antigravity
**狀態：** 待修復
