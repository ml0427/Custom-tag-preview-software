# Preview Edit Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the primary edit modals with a segmented preview-side edit panel and move metadata lookup to item context menus.

**Architecture:** `PreviewPane.vue` owns the read/edit tab state and delegates editing to a new `PreviewEditPanel.vue`. `ItemGallery.vue` becomes the owner of edit-mode routing, metadata lookup modal state, current DB item refresh, and gallery/tag refresh propagation. List and thumbnail context menus emit a metadata lookup event instead of owning modal state.

**Tech Stack:** Vue 3 SFC with `<script setup lang="ts">`, Vitest, Tauri API wrapper, existing gallery composables and theme tokens.

---

## File Structure

- Create `src/utils/previewEdit.ts`: Pure capability helpers for preview edit UI.
- Create `src/utils/previewEdit.test.ts`: TDD coverage for item-type edit capabilities.
- Create `src/components/PreviewEditPanel.vue`: Side-panel editor for name, tags, note, category, folder presets, archive cover images.
- Modify `src/components/PreviewPane.vue`: Add segmented `info/edit` tabs and embed `PreviewEditPanel`.
- Modify `src/components/ItemGallery.vue`: Replace modal-style edit events with preview edit routing; own metadata lookup modal.
- Modify `src/components/FileExplorerTable.vue`: Add context-menu `metadataLookup` emit.
- Modify `src/components/ThumbnailGridView.vue`: Add context-menu `metadataLookup` emit.
- Modify `src/App.vue`: Remove primary edit modal state/imports/mounting and adapt gallery refresh events.
- Modify `.gitignore`: Ignore `.superpowers/` local brainstorming artifacts created by this workflow.

## Task 1: Preview Edit Capability Tests

**Files:**
- Create: `src/utils/previewEdit.test.ts`
- Create: `src/utils/previewEdit.ts`

- [ ] **Step 1: Write failing tests**

Create `src/utils/previewEdit.test.ts` with tests for file and folder edit capabilities:

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '../api';
import { getPreviewEditCapabilities } from './previewEdit';

const item = (overrides: Partial<Item>): Item => ({
  id: 1,
  path: 'C:/Library/book.zip',
  itemType: 'file',
  name: 'book.zip',
  fileSize: 100,
  fileModifiedAt: 1_779_340_800,
  coverCachePath: null,
  fingerprint: null,
  note: null,
  category: 'comic',
  existsOnDisk: true,
  missingSince: null,
  lastSeenAt: '2026-05-28T10:00:00Z',
  importAt: '2026-05-28T10:00:00Z',
  tags: [],
  ...overrides,
});

describe('getPreviewEditCapabilities', () => {
  it('enables file editing fields without folder-only automation', () => {
    expect(getPreviewEditCapabilities(item({ itemType: 'file' }))).toEqual({
      canEditName: true,
      canEditTags: true,
      canEditNote: false,
      canEditCategory: true,
      canEditFolderRules: false,
      canEditCoverImages: true,
    });
  });

  it('enables folder note and automation fields without file-only category or cover images', () => {
    expect(getPreviewEditCapabilities(item({
      itemType: 'folder',
      path: 'C:/Library/Series',
      name: 'Series',
      fileSize: null,
      category: null,
    }))).toEqual({
      canEditName: true,
      canEditTags: true,
      canEditNote: true,
      canEditCategory: false,
      canEditFolderRules: true,
      canEditCoverImages: false,
    });
  });
});
```

- [ ] **Step 2: Verify red**

Run: `npm test -- src/utils/previewEdit.test.ts`

Expected: FAIL because `./previewEdit` does not exist.

- [ ] **Step 3: Implement helper**

Create `src/utils/previewEdit.ts`:

```ts
import type { Item } from '../api';

export interface PreviewEditCapabilities {
  canEditName: boolean;
  canEditTags: boolean;
  canEditNote: boolean;
  canEditCategory: boolean;
  canEditFolderRules: boolean;
  canEditCoverImages: boolean;
}

export function getPreviewEditCapabilities(item: Item): PreviewEditCapabilities {
  const isFolder = item.itemType === 'folder';
  return {
    canEditName: true,
    canEditTags: true,
    canEditNote: isFolder,
    canEditCategory: !isFolder,
    canEditFolderRules: isFolder,
    canEditCoverImages: !isFolder,
  };
}
```

- [ ] **Step 4: Verify green**

Run: `npm test -- src/utils/previewEdit.test.ts`

Expected: PASS.

## Task 2: Preview Edit Panel Component

**Files:**
- Create: `src/components/PreviewEditPanel.vue`
- Modify: `src/components/PreviewPane.vue`

- [ ] **Step 1: Run GitNexus impact before editing symbols**

Run GitNexus impact for `PreviewPane` and any existing symbol modified in `PreviewPane.vue`.

- [ ] **Step 2: Implement `PreviewEditPanel.vue`**

Create a focused component with props `{ item: Item; allTags: Tag[] }` and emits `{ updated, tagsChanged, deleted }`.

It must:
- Initialize local tags with `useTagManager`.
- Save display name via `api.setItemDisplayName`.
- Save folder note via `api.setItemNote`.
- Save file category via `api.setItemCategory` and apply matching tag rules.
- Load and save folder rule presets via existing APIs.
- Load archive images via `api.getItemImages` for zip/cbz only.
- Set file cover via `api.setItemCover`.
- Use existing `TagEditorField`.
- Keep inputs/selects at `min-width: 0` inside flex/grid containers.

- [ ] **Step 3: Embed editor in `PreviewPane.vue`**

Add `activeTab` state with `'info' | 'edit'`, optional `initialTab` prop, `allTags` prop, and events:

```ts
(e: 'updated'): void
(e: 'tagsChanged'): void
(e: 'deleted'): void
```

The template shows a segmented control when `item` exists. The info tab keeps the existing `MediaViewer` and `MetadataPanel`. The edit tab renders `PreviewEditPanel`.

- [ ] **Step 4: Verify build-level type safety for component changes**

Run: `npm run build`

Expected: PASS, or fix TypeScript/Vue errors before continuing.

## Task 3: Gallery Routing and Metadata Context Menu

**Files:**
- Modify: `src/components/ItemGallery.vue`
- Modify: `src/components/FileExplorerTable.vue`
- Modify: `src/components/ThumbnailGridView.vue`

- [ ] **Step 1: Run GitNexus impact before editing symbols**

Run GitNexus impact for `ItemGallery`, `FileExplorerTable`, and `ThumbnailGridView`, plus changed handler functions.

- [ ] **Step 2: Add metadata lookup emits**

Add `metadataLookup` emits to `FileExplorerTable.vue` and `ThumbnailGridView.vue`. Both directory and file context menus must include a `Metadata 查詢 / tags` action near tag/rule actions.

- [ ] **Step 3: Route old edit actions to preview edit mode**

In `ItemGallery.vue`, replace upstream modal emits with local handlers that:
- Ensure a DB item exists via existing `quickImportItem` flow.
- Select the file path.
- Open the preview pane.
- Set preview initial tab to `edit`.

- [ ] **Step 4: Own `MetadataLookupModal` in gallery**

Add local `metadataLookupItem` state. The right-click metadata handler quick-imports when needed, sets `metadataLookupItem`, and opens the existing modal. On applied, close or keep the modal according to current modal behavior and refresh gallery/tags.

- [ ] **Step 5: Verify tests**

Run: `npm test`

Expected: PASS.

## Task 4: Remove App-Level Edit Modals

**Files:**
- Modify: `src/App.vue`
- Modify: `.gitignore`

- [ ] **Step 1: Run GitNexus impact before editing symbols**

Run GitNexus impact for `App` and changed `App.vue` handlers.

- [ ] **Step 2: Remove modal imports and state**

Remove `ItemDetailModal`, `FolderDetailModal`, and `ItemCategoryModal` imports, selected modal refs, and modal mounting from `App.vue`.

- [ ] **Step 3: Wire gallery refresh events**

Pass `allTags` to each `ItemGallery`, wire `tagsChanged` to `handleTagsChanged`, and wire `itemUpdated/itemDeleted` refresh paths to existing gallery refresh logic.

- [ ] **Step 4: Ignore local Superpowers artifacts**

Add `.superpowers/` to `.gitignore`.

- [ ] **Step 5: Verify build**

Run: `npm run build`

Expected: PASS.

## Task 5: Final Verification and Upload

**Files:**
- All changed files.

- [ ] **Step 1: Full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Required frontend build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: GitNexus changed-scope check**

Run GitNexus detect changes on all changed files before commit.

Expected: affected scope matches preview edit panel, gallery routing, context menus, and docs/plan.

- [ ] **Step 4: Commit only relevant files**

Stage implementation, tests, plan, and `.gitignore`; do not stage unrelated `AGENTS.md` or `CLAUDE.md` changes.

Commit message: `feat: move item editing into preview panel`

- [ ] **Step 5: Push**

Push branch `codex/preview-edit-panel` to origin.
