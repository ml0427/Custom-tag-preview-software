# 常用項目模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "常用" gallery mode that records successful read/system-open actions, hides zero-open items, and sorts opened items by usage count.

**Architecture:** Store usage count on the existing `items` row as `open_count`, expose it as `openCount`, and add a path-based `record_item_open` command so untracked files can be imported and counted. Keep the UI as a gallery-level view toggle near the existing view buttons; filtering and sorting stay in `useGalleryData`.

**Tech Stack:** Vue 3, Vitest, Tauri v2, Rust, SQLx SQLite, Cargo tests.

---

### Task 1: Persist And Expose Open Count

**Files:**
- Modify: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/commands/helpers.rs`
- Modify: `src-tauri/src/commands/filesystem.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/api.ts`
- Test: `src-tauri/src/db.rs`
- Test: `src/api.test.ts`

- [ ] **Step 1: Write failing backend tests**

Add tests to `src-tauri/src/db.rs`:

```rust
#[tokio::test]
async fn init_db_adds_open_count_to_items() {
    let dir = tempdir().unwrap();
    let pool = init_db(dir.path()).await.unwrap();

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name = 'open_count'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(count, 1);
}

#[tokio::test]
async fn record_item_open_increments_existing_item() {
    let dir = tempdir().unwrap();
    let pool = init_db(dir.path()).await.unwrap();
    let item_id = insert_item(
        &pool,
        "C:/Library/book.zip",
        "file",
        "book",
        Some(123),
        Some(456),
        "2026-06-19T10:00:00Z",
        None,
    )
    .await
    .unwrap();

    increment_item_open_count(&pool, item_id).await.unwrap();
    increment_item_open_count(&pool, item_id).await.unwrap();

    let open_count: i64 = sqlx::query_scalar("SELECT open_count FROM items WHERE id = ?")
        .bind(item_id)
        .fetch_one(&pool)
        .await
        .unwrap();

    assert_eq!(open_count, 2);
}
```

Add an API test to `src/api.test.ts`:

```ts
it('records item opens by path', async () => {
  invokeMock.mockResolvedValueOnce(undefined);

  await api.recordItemOpen('C:/Library/book.zip');

  expect(invokeMock).toHaveBeenCalledWith('record_item_open', {
    path: 'C:/Library/book.zip',
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri\Cargo.toml db::tests::init_db_adds_open_count_to_items db::tests::record_item_open_increments_existing_item`

Expected: FAIL because `increment_item_open_count` and/or `open_count` do not exist.

Run: `npm test -- src/api.test.ts`

Expected: FAIL because `api.recordItemOpen` does not exist.

- [ ] **Step 3: Implement persistence and API**

Add `open_count INTEGER NOT NULL DEFAULT 0` to `items`, add idempotent `ALTER TABLE`, add `open_count` to Rust and TypeScript `Item`, map it in `read_item_from_row`, create `db::increment_item_open_count`, add `record_item_open(path)` in filesystem commands by reusing `quick_import_item`, expose it in `api.ts`, and register it in `main.rs`.

- [ ] **Step 4: Run tests to verify pass**

Run: `cargo test --manifest-path src-tauri\Cargo.toml db::tests::init_db_adds_open_count_to_items db::tests::record_item_open_increments_existing_item`

Expected: PASS.

Run: `npm test -- src/api.test.ts`

Expected: PASS.

### Task 2: Add Frequent Mode Data Behavior

**Files:**
- Modify: `src/composables/useGalleryViewState.ts`
- Modify: `src/composables/useGalleryData.ts`
- Modify: `src/components/ItemGallery.vue`
- Test: `src/composables/useGalleryData.test.ts`

- [ ] **Step 1: Write failing frontend data tests**

Add tests to `src/composables/useGalleryData.test.ts`:

```ts
it('filters frequent mode to opened items and sorts by open count descending', async () => {
  apiMock.listDirFiles.mockResolvedValueOnce([
    file('never.zip', 20, '2026-05-21 09:00'),
    file('often.zip', 20, '2026-05-21 09:00'),
    file('sometimes.zip', 20, '2026-05-21 09:00'),
  ]);
  apiMock.getItems
    .mockResolvedValueOnce(page([]))
    .mockResolvedValueOnce(page([
      item({ id: 1, path: 'C:/Library/never.zip', name: 'never', openCount: 0 }),
      item({ id: 2, path: 'C:/Library/often.zip', name: 'often', openCount: 7 }),
      item({ id: 3, path: 'C:/Library/sometimes.zip', name: 'sometimes', openCount: 2 }),
    ]));

  const gallery = useGalleryData(
    () => 'C:/Library',
    () => undefined,
    () => '',
    () => 'name',
    () => 'asc',
    () => true,
  );

  await gallery.loadAll();
  await nextTick();

  expect(gallery.filteredFileItems.value.map(item => item.name)).toEqual(['often.zip', 'sometimes.zip']);
});

it('applies search inside frequent mode results', async () => {
  apiMock.listDirFiles.mockResolvedValueOnce([
    file('Alpha.zip', 20, '2026-05-21 09:00'),
    file('Beta.zip', 20, '2026-05-21 09:00'),
  ]);
  apiMock.getItems
    .mockResolvedValueOnce(page([]))
    .mockResolvedValueOnce(page([
      item({ id: 1, path: 'C:/Library/Alpha.zip', name: 'Alpha', openCount: 3 }),
      item({ id: 2, path: 'C:/Library/Beta.zip', name: 'Beta', openCount: 5 }),
    ]));

  const gallery = useGalleryData(
    () => 'C:/Library',
    () => undefined,
    () => 'alpha',
    () => 'name',
    () => 'asc',
    () => true,
  );

  await gallery.loadAll();
  await nextTick();

  expect(gallery.filteredFileItems.value.map(item => item.name)).toEqual(['Alpha.zip']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/composables/useGalleryData.test.ts`

Expected: FAIL because `useGalleryData` does not accept frequent mode and `Item` lacks `openCount` in tests.

- [ ] **Step 3: Implement data behavior**

Add a persisted `frequentMode` boolean in `useGalleryViewState`, pass it from `ItemGallery` into `useGalleryData`, and make `filteredFileItems` filter to DB-backed `openCount > 0` entries and sort by `openCount DESC`, tie-breaking by name.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/composables/useGalleryData.test.ts`

Expected: PASS.

### Task 3: Record Successful Opens

**Files:**
- Create: `src/utils/openTracking.ts`
- Modify: `src/components/ItemGallery.vue`
- Modify: `src/components/PreviewPane.vue`
- Modify: `src/components/ItemCategoryModal.vue`
- Modify: `src/components/FolderDetailModal.vue`
- Test: `src/utils/openTracking.test.ts`

- [ ] **Step 1: Write failing component tests**

Create `src/utils/openTracking.test.ts` with tests that verify system-open tracking records after a successful opener, does not record when the opener fails, and does not reject the main operation when the record call fails.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/utils/openTracking.test.ts`

Expected: FAIL because `src/utils/openTracking.ts` does not exist.

- [ ] **Step 3: Implement open recording**

Add `recordOpenForPath(path)` and `openFileAndRecord(path, openFile, recordOpen)` helpers. Use them after successful `openReaderForFileItem` and for every `api.openFile` UI action. Do not call them for folder navigation, selection, preview, metadata lookup, failed reads, failed system opens, or `openInExplorer`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/utils/openTracking.test.ts`

Expected: PASS.

### Task 4: Add Frequent Toggle UI

**Files:**
- Modify: `src/components/GalleryToolbar.vue`
- Modify: `src/components/ItemGallery.vue`
- Test: `src/components/GalleryToolbar.frequent.test.ts`

- [ ] **Step 1: Write failing toolbar test**

Create `src/components/GalleryToolbar.frequent.test.ts` and verify the toolbar source declares `frequentMode`, emits `update:frequentMode`, and contains a `常用` button with `title="顯示常用項目"`. The final build verifies the Vue SFC compiles.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/GalleryToolbar.frequent.test.ts`

Expected: FAIL because the button and prop do not exist.

- [ ] **Step 3: Implement toolbar toggle**

Add a `frequentMode` prop and `update:frequentMode` emit to `GalleryToolbar.vue`. Render the button next to the list/grid buttons, use a compact icon plus visually small text `常用`, and style active state consistently with existing view buttons.

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- src/components/GalleryToolbar.frequent.test.ts`

Expected: PASS.

### Task 5: Full Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run frontend tests**

Run: `npm test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Run Rust tests**

Run: `cargo test --manifest-path src-tauri\Cargo.toml`

Expected: all Cargo tests pass.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: Vite build completes successfully.

- [ ] **Step 4: Check git diff**

Run: `git status --short` and `git diff --stat`

Expected: only frequent-items implementation files and docs plan are changed.
