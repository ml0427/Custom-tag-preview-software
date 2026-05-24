# 新增/移除 Source 自動同步子目錄 — 影響範圍分析

> 分析日期：2026-05-24
> 供其他 AI（小G、大G、小N）接手實作時參考

## 需求摘要

1. **add_source** — 新增來源目錄時，自動遞迴掃描所有子目錄並追蹤（quickImport）到 DB，顯示進度
2. **remove_source** — 移除來源目錄時，自動清除該路徑下所有 DB items（含縮圖快取），提示使用者

---

## 直接影響 — 必須改

### Rust 後端

| 檔案 | 函數 | 現在 | 要改成 |
|---|---|---|---|
| `src-tauri/src/commands/sources.rs:14` | `add_source` | 只 INSERT sources，回 `Source` | 遞迴蒐集所有子目錄 → 逐一 `quick_import_item` → 回 `{ source, importedCount }` |
| `src-tauri/src/commands/sources.rs:23` | `remove_source` | 只 DELETE sources，回 `()` | 查 `items WHERE path LIKE source_path%` → 逐一 untrack（含縮圖快取）→ 刪 source → 回 `{ removedCount }` |
| `src-tauri/src/commands/filesystem.rs` | `list_subdirs` | 只回一層 | 需新增遞迴版，或直接在 add_source 內遞迴呼叫 |
| `src-tauri/src/db.rs` | — | 無前綴查詢 | 需新增：`SELECT id, path FROM items WHERE path LIKE ?` 及批量 untrack helper |
| `src-tauri/src/main.rs:105` | `generate_handler!` | — | 若要 Tauri event emit 進度則需在此註冊 |

### 前端 TypeScript/Vue

| 檔案 | 位置 | 現在 | 要改成 |
|---|---|---|---|
| `src/api.ts:236` | `addSource` | `invoke('add_source', { path })` → `Promise<Source>` | 回 `Promise<{ source, importedCount }>` |
| `src/api.ts:240` | `removeSource` | `invoke('remove_source', { id })` → `Promise<void>` | 回 `Promise<{ removedCount }>` |
| `src/composables/useSources.ts:27` | `handleAddSource` | `await api.addSource(path)` → `loadSources()` | 顯示 spinner → toast「已匯入 N 個子目錄」→ `loadSources()` |
| `src/composables/useSources.ts:38` | `handleRemoveSource` | 對話框寫「不影響已匯入項目」 | 對話框改「底下 N 個子目錄也會一併清除」→ toast → `loadSources()` |
| `src/components/SourcePanel.vue` | template | 無進度 UI | 加入 source 時的進度條（可用現有 `.folder-progress` 樣式） |

---

## 間接影響 — 需檢查

| 檔案 | 風險 |
|---|---|
| `src/composables/useGalleryData.ts:134` `loadAll` | 加 source → `selectedPath` 變化 → `ItemGallery` watcher 觸發 `loadAll`，應自然刷新。刪 source 後若 selectedPath 被清 null，`loadFileItems` 會清空，`loadItemsBackground` 查無結果。**理論上正常，需實測。** |
| `src/components/ItemGallery.vue` | watcher 監聽 `selectedPath` → `loadAll()`，source 變更後應自然觸發 |
| `src/App.vue` | 刪 source 後，若已開啟的 `ItemDetailModal` 參考到已被 untrack 的 item，modal 可能參考孤兒資料。需確認 modal 的 `v-if`/`v-else` 防禦。 |
| `src/composables/useFolderRuleActions.ts` | 刪 source 時若清掉 folder items，後續操作只會找不到資料，不會 crash |

---

## 不受影響

- `useContextMenu.ts` / `DirTreeNode.vue` / `LocalDirTree.vue` — 樹狀結構從 `sources` ref 驅動，自然響應
- `FileExplorerTable.vue` / `ThumbnailGridView.vue` — 只顯示 `filteredFileItems`，由 gallery 驅動
- `useThumbnailLoader.ts` / `useExternalChanges.ts` / `useTagManager.ts` / `useItemTypes.ts` / `useToast.ts` — 工具層獨立
- `DuplicateSection.vue` / `FileHealthView.vue` — 無關
- Tag rules / scan wizard / debug mode — 完全無關
- `src-tauri/src/commands/scan.rs` `sync_sources` — 概念相近但不同路徑，不需改（可考慮未來共用遞迴邏輯）

---

## 風險點

1. **巨型目錄** — 遞迴 listSubdirs + N 次 quickImport，幾千個子目錄可能卡數秒。建議加 cancel 機制或分批 emit progress。
2. **路徑重疊** — `path LIKE source_path%` 若兩個 source 路徑有重疊（如 `C:\A` 和 `C:\A\B`），刪上層時可能誤清下層 items。需確認設計意圖。
3. **App.vue modal** — source/item 被刪後，已開啟的 `ItemDetailModal` 可能參考到不存在的 item。
