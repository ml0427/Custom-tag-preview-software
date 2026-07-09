# Archive Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 Custom Tag Preview 的整套 Vue 前端重設計成一致、可操作且保留既有行為的 Archive Workbench 桌面工作台。

**Architecture:** 保留 `ItemGallery` 作為資料與互動協調層，透過語意 design tokens、repo-local `AppIcon`、穩定的 application shell、command bar 與 Inspector 重組畫面。每個切面只改 UI 狀態與元件呈現，不新增後端資料來源，也不改既有 Tauri command。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、TypeScript、Vanilla scoped CSS、Pinia、Vitest source-contract tests、Vite、Tauri v2。

## Global Constraints

- 保留既有 SQLite schema、Rust 資料層、Tauri API、掃描流程、標籤邏輯與閱讀器行為。
- 保留 Obsidian、Forge、Parchment、Phosphor 四套主題，主題差異只由 token 值驅動。
- 不增加 UI framework 或 icon dependency；共用圖示由 `src/components/AppIcon.vue` 提供。
- `ItemGallery` 仍是 selection、view state、modal、reader 與資料刷新協調層。
- 所有純圖示按鈕提供 `aria-label` 或可辨識的 `title`，focus-visible 在四主題清楚可見。
- 主要桌面基準是 1440×900；1280px、1024px 與低於 960px 必須保持可用。
- 既有方向鍵、Enter、Delete、F2、Escape、多選、右鍵、閱讀與捲動記憶不得退化。
- 所有實作留在 `codex/archive-workbench-redesign`，推送此分支但不合併 `main`。

## File Map

**Create**

- `src/components/AppIcon.vue`：唯一的介面圖示 renderer，接受語意名稱與尺寸。
- `src/components/ArchiveWorkbench.foundation.test.ts`：鎖定 design tokens、共用圖示與全域 focus primitive。
- `src/components/ArchiveWorkbench.shell.test.ts`：鎖定 primary rail 與 application shell 契約。
- `src/components/GalleryToolbar.workbench.test.ts`：鎖定 command bar、segmented control 與 accessible icon controls。
- `src/components/ItemGallery.inspector.test.ts`：鎖定 Inspector 與 selection toolbar wiring。
- `src/components/ArchiveWorkbench.surfaces.test.ts`：鎖定 gallery cards、table、secondary pages 與 overlay 語言。

**Modify**

- `src/themes.css`：加入語意 surface／content／line／control tokens，四主題各自映射。
- `src/style.css`：建立全域工作台 primitives、focus、button、input、popover 與 responsive 基線。
- `src/App.vue`：application shell、context sidebar 與浮動掃描狀態。
- `src/components/ActivityBar.vue`：primary rail 與清楚的文字標籤。
- `src/components/SourcePanel.vue`、`src/components/TagSidebar.vue`：context sidebar 的 section header、empty state 與 selection styling。
- `src/components/GalleryToolbar.vue`、`src/components/GalleryInfoBar.vue`：command bar 與內容摘要。
- `src/components/ItemGallery.vue`：workspace header、selection toolbar、empty/loading states 與 Inspector layout。
- `src/components/ThumbnailCard.vue`、`src/components/ThumbnailGridView.vue`、`src/components/FileExplorerTable.vue`：一致的內容畫布、卡片、表格與 context menu。
- `src/components/PreviewPane.vue`、`src/components/PreviewEditPanel.vue`：Inspector 視覺與資訊層級。
- `src/components/ToastContainer.vue`：toast、confirm dialog 與新 overlay primitives。
- `src/components/MetadataLookupModal.vue`、`src/components/ItemDetailModal.vue`、`src/components/ItemCategoryModal.vue`、`src/components/FolderDetailModal.vue`、`src/components/CategoryManageModal.vue`、`src/components/ScanWizardModal.vue`：共用 workbench modal surface，不變更既有資料與事件。
- `src/components/SettingsPanel.vue`、`src/components/FileHealthView.vue`：共用 page shell 與卡片語言。
- `index.html`、`src-tauri/tauri.conf.json`：由 project build stamp 產生的版本資訊。

---

### Task 1: Foundation tokens and AppIcon

**Files:**

- Create: `src/components/AppIcon.vue`
- Create: `src/components/ArchiveWorkbench.foundation.test.ts`
- Modify: `src/themes.css`
- Modify: `src/style.css`

**Interfaces:**

- Consumes: 現有 `--bg-*`、`--text-*`、`--border-*`、`--accent` 四主題變數。
- Produces: `AppIcon` props `name: AppIconName`, `size?: number`, `strokeWidth?: number`；新語意 tokens 供後續所有 task 使用。

- [ ] **Step 1: Write the failing foundation contract test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Archive Workbench foundation', () => {
  const themes = readFileSync(new URL('../themes.css', import.meta.url), 'utf8');
  const globalStyle = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const icon = readFileSync(new URL('./AppIcon.vue', import.meta.url), 'utf8');

  it('defines semantic workbench tokens', () => {
    for (const token of ['--surface-canvas', '--surface-panel', '--surface-raised', '--line-default', '--content-primary', '--control-height-md', '--panel-gap']) {
      expect(themes).toContain(token);
    }
  });

  it('provides a reusable currentColor icon renderer', () => {
    expect(icon).toContain('export type AppIconName');
    expect(icon).toContain('currentColor');
    expect(icon).toContain('aria-hidden="true"');
  });

  it('uses a visible keyboard focus primitive', () => {
    expect(globalStyle).toContain(':focus-visible');
    expect(globalStyle).toContain('var(--ring-focus)');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/components/ArchiveWorkbench.foundation.test.ts`

Expected: FAIL because `AppIcon.vue` and semantic tokens do not exist.

- [ ] **Step 3: Implement AppIcon and semantic token aliases**

Create `AppIcon.vue` with this public surface and all names used by later tasks:

```vue
<script setup lang="ts">
export type AppIconName =
  | 'archive' | 'folder' | 'tag' | 'shield' | 'settings'
  | 'search' | 'arrow-up' | 'refresh' | 'list' | 'grid'
  | 'star' | 'panel-right' | 'chevron-left' | 'chevron-right'
  | 'x' | 'play' | 'more' | 'trash' | 'check' | 'alert';

withDefaults(defineProps<{
  name: AppIconName;
  size?: number;
  strokeWidth?: number;
}>(), { size: 18, strokeWidth: 1.8 });
</script>

<template>
  <svg class="app-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'search'"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></template>
    <template v-else-if="name === 'folder'"><path d="M3 7.5h7l2-2h9v13H3z"/></template>
    <template v-else-if="name === 'tag'"><path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8" cy="8" r="1"/></template>
    <template v-else-if="name === 'list'"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></template>
    <template v-else-if="name === 'grid'"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></template>
    <template v-else-if="name === 'star'"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9z"/></template>
    <template v-else><circle cx="12" cy="12" r="8"/><path d="M8 12h8"/></template>
  </svg>
</template>
```

In each theme block map semantic tokens to existing values; the default theme must include:

```css
--surface-canvas: var(--bg-app);
--surface-panel: var(--bg-panel);
--surface-raised: var(--bg-elevated);
--surface-hover: var(--bg-hover);
--line-subtle: var(--border-subtle);
--line-default: var(--border-default);
--line-strong: var(--border-strong);
--content-primary: var(--text-primary);
--content-secondary: var(--text-secondary);
--content-muted: var(--text-tertiary);
--control-height-sm: 30px;
--control-height-md: 36px;
--panel-gap: 12px;
```

Add global `:focus-visible`, `.icon-button`, `.workbench-card`, `.workbench-kicker`, and `.surface-popover` primitives without changing component behavior.

- [ ] **Step 4: Run focused and full tests**

Run: `npm test -- src/components/ArchiveWorkbench.foundation.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all existing tests PASS.

- [ ] **Step 5: Commit the foundation**

```powershell
git add src/components/AppIcon.vue src/components/ArchiveWorkbench.foundation.test.ts src/themes.css src/style.css
git commit -m "feat: add archive workbench foundation"
```

---

### Task 2: Application shell and primary rail

**Files:**

- Create: `src/components/ArchiveWorkbench.shell.test.ts`
- Modify: `src/App.vue`
- Modify: `src/components/ActivityBar.vue`
- Modify: `src/components/SourcePanel.vue`
- Modify: `src/components/TagSidebar.vue`

**Interfaces:**

- Consumes: `AppIcon`, semantic tokens, existing `activePanel`, `lastMainView`, source and tag selection events.
- Produces: `.app-shell`, `.primary-rail`, `.context-sidebar`, `.content-stage` layout; no changes to `ActivityBar` emit signature.

- [ ] **Step 1: Write the failing shell test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Archive Workbench application shell', () => {
  const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
  const rail = readFileSync(new URL('./ActivityBar.vue', import.meta.url), 'utf8');

  it('renders named shell regions', () => {
    expect(app).toContain('class="app-shell"');
    expect(app).toContain('class="context-sidebar"');
    expect(app).toContain('class="content-stage"');
  });

  it('gives primary destinations visible labels', () => {
    for (const label of ['工作目錄', '標籤', '健檢', '設定']) expect(rail).toContain(label);
    expect(rail).toContain('<AppIcon');
    expect(rail).toContain('aria-label="主要導覽"');
  });
});
```

- [ ] **Step 2: Run the shell test and verify it fails**

Run: `npm test -- src/components/ArchiveWorkbench.shell.test.ts`

Expected: FAIL because named shell regions and visible rail labels are missing.

- [ ] **Step 3: Rebuild ActivityBar as the primary rail**

Keep props and emit unchanged. Render `nav.activity-bar.primary-rail` with a brand mark, three main items, bottom settings item, `AppIcon`, visible `.activity-label`, `aria-current="page"` for the active destination, and concise tooltips. Replace inline SVG paths with `AppIcon`.

The navigation data remains:

```ts
const items = [
  { id: 'workspace', label: '工作目錄', shortLabel: '目錄', icon: 'folder' },
  { id: 'tags', label: '標籤篩選', shortLabel: '標籤', icon: 'tag' },
  { id: 'file-health', label: '檔案健檢', shortLabel: '健檢', icon: 'shield' },
] as const;
```

- [ ] **Step 4: Recompose App.vue without changing data flow**

Rename layout wrappers to:

```vue
<div class="app-shell" @contextmenu.prevent>
  <ActivityBar ... />
  <aside v-if="..." class="context-sidebar" aria-label="內容導覽">...</aside>
  <main class="content-stage">...</main>
</div>
```

Retain both `ItemGallery` instances, their `v-show` conditions, all emits, Toast Teleport, scan listener and cancel behavior. Style the scan bar as `.scan-status-capsule` while retaining the existing state and button.

Update SourcePanel and TagSidebar only at the presentation layer: section kicker, heading, count/empty copy, bordered footer action, active row, and focus-visible states. Do not rename emits.

- [ ] **Step 5: Verify shell behavior**

Run: `npm test -- src/components/ArchiveWorkbench.shell.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit the shell**

```powershell
git add src/App.vue src/components/ActivityBar.vue src/components/SourcePanel.vue src/components/TagSidebar.vue src/components/ArchiveWorkbench.shell.test.ts
git commit -m "feat: redesign archive workbench shell"
```

---

### Task 3: Gallery command bar and content header

**Files:**

- Create: `src/components/GalleryToolbar.workbench.test.ts`
- Modify: `src/components/GalleryToolbar.vue`
- Modify: `src/components/GalleryInfoBar.vue`
- Modify: `src/components/ItemGallery.vue`

**Interfaces:**

- Consumes: existing GalleryToolbar props and emits; `AppIcon`; existing `selectedPaths`, filters, sorting and `loadAll` functions.
- Produces: `.gallery-command-bar`, `.view-segment`, `.workspace-heading`, `.selection-command-bar`; existing props/emits remain source-compatible.

- [ ] **Step 1: Write the failing command bar test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Archive Workbench gallery command bar', () => {
  const toolbar = readFileSync(new URL('./GalleryToolbar.vue', import.meta.url), 'utf8');
  const gallery = readFileSync(new URL('./ItemGallery.vue', import.meta.url), 'utf8');

  it('groups search and view controls into accessible regions', () => {
    expect(toolbar).toContain('class="gallery-command-bar"');
    expect(toolbar).toContain('class="view-segment"');
    expect(toolbar).toContain('aria-label="顯示模式"');
    expect(toolbar).toContain('<AppIcon');
  });

  it('keeps selection actions inside the workbench command surface', () => {
    expect(gallery).toContain('class="selection-command-bar"');
    expect(gallery).not.toContain('class="batch-action-bar"');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/components/GalleryToolbar.workbench.test.ts`

Expected: FAIL on missing command bar classes.

- [ ] **Step 3: Implement the command bar**

Keep GalleryToolbar's current props/emits. Build three groups:

```vue
<div class="gallery-command-bar" role="search">
  <div v-if="sourcePath" class="navigation-controls">...</div>
  <label class="command-search"><AppIcon name="search"/><input v-model="gallerySearch" ... /></label>
  <div class="command-actions">
    <div v-if="viewMode === 'grid'" class="sort-controls">...</div>
    <div class="view-segment" role="group" aria-label="顯示模式">...</div>
    <button class="command-chip" :aria-pressed="frequentMode">...</button>
  </div>
</div>
```

Use `AppIcon` for up, refresh, search, clear, list, grid and star. Keep `title="顯示常用項目"` and the visible text `常用` so the existing frequent-mode test remains valid.

- [ ] **Step 4: Integrate heading, info summary and selection mode**

In ItemGallery, add `.workspace-heading` above the command bar with contextual title derived from `sourcePath`, `selectedTagId`, or `工作台`, without adding API calls. Move the existing Teleported batch bar into the gallery container as `.selection-command-bar`; keep its tag picker, batch add/remove/delete methods and button text unchanged.

Restyle GalleryInfoBar into compact summary pills while retaining its props. Differentiate no source, loading, no results and frequent-mode empty states with an eyebrow, heading and one concise hint.

- [ ] **Step 5: Run focused regressions**

Run: `npm test -- src/components/GalleryToolbar.workbench.test.ts src/components/GalleryToolbar.frequent.test.ts src/components/ItemGallery.frequentCount.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit the command surface**

```powershell
git add src/components/GalleryToolbar.vue src/components/GalleryInfoBar.vue src/components/ItemGallery.vue src/components/GalleryToolbar.workbench.test.ts
git commit -m "feat: unify gallery command surfaces"
```

---

### Task 4: Gallery cards, table and context surfaces

**Files:**

- Create: `src/components/ArchiveWorkbench.surfaces.test.ts`
- Modify: `src/components/ThumbnailCard.vue`
- Modify: `src/components/ThumbnailGridView.vue`
- Modify: `src/components/FileExplorerTable.vue`
- Modify: `src/components/ToastContainer.vue`

**Interfaces:**

- Consumes: existing ThumbnailCard props, grid/table emits, `AppIcon`, context menu behavior and toast store.
- Produces: `.archive-card`, `.archive-table`, `.surface-popover`, `.toast-card`, `.confirm-card` visual contracts; no event changes.

- [ ] **Step 1: Write the failing surface test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Archive Workbench content surfaces', () => {
  const card = readFileSync(new URL('./ThumbnailCard.vue', import.meta.url), 'utf8');
  const table = readFileSync(new URL('./FileExplorerTable.vue', import.meta.url), 'utf8');
  const toast = readFileSync(new URL('./ToastContainer.vue', import.meta.url), 'utf8');

  it('uses shared gallery surface names', () => {
    expect(card).toContain('archive-card');
    expect(table).toContain('archive-table');
    expect(table).toContain('surface-popover');
  });

  it('keeps feedback inside workbench cards', () => {
    expect(toast).toContain('toast-card');
    expect(toast).toContain('confirm-card');
  });
});
```

- [ ] **Step 2: Run the surface test and verify it fails**

Run: `npm test -- src/components/ArchiveWorkbench.surfaces.test.ts`

Expected: FAIL because workbench surface classes are absent.

- [ ] **Step 3: Redesign thumbnail cards and grid**

Add `.archive-card` to the existing card root. Keep click, double-click, contextmenu, rename, read action, badges and tags unchanged. Rebuild the visual hierarchy as cover -> title -> metadata row -> tag row. Use a gradient scrim only behind hover actions; selected state must have both accent border and a visible check marker.

Grid CSS uses responsive `minmax(150px, 1fr)` columns, stable gaps and content-canvas background. Preserve the existing scroll element, queue, thumbnail loading and context menu events.

- [ ] **Step 4: Redesign table and popovers**

Add `.archive-table` to the existing table. Keep virtual spacers, sticky header, column picker, resize-independent widths, row actions and keydown logic. Change only presentation: 52px rows, stronger name hierarchy, subtle selected bar and persistent focus-visible read action.

Add `.surface-popover` to both table and grid context menu roots, and apply the shared popover tokens while keeping every action and divider.

- [ ] **Step 5: Redesign toast and confirm surfaces**

Add `.toast-card` and `.confirm-card`; keep the same store, transition and resolve handlers. Toasts use a narrow status rail plus text surface rather than full saturated backgrounds. Confirm actions keep cancel and destructive confirmation order.

- [ ] **Step 6: Run focused regressions**

Run: `npm test -- src/components/ArchiveWorkbench.surfaces.test.ts src/components/ThumbnailCard.metadata.test.ts src/components/ThumbnailGridView.metadata.test.ts src/components/FileExplorerTable.readButton.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 7: Commit gallery surfaces**

```powershell
git add src/components/ThumbnailCard.vue src/components/ThumbnailGridView.vue src/components/FileExplorerTable.vue src/components/ToastContainer.vue src/components/ArchiveWorkbench.surfaces.test.ts
git commit -m "feat: refine archive gallery surfaces"
```

---

### Task 5: Inspector, secondary pages and responsive completion

**Files:**

- Create: `src/components/ItemGallery.inspector.test.ts`
- Modify: `src/components/ItemGallery.vue`
- Modify: `src/components/PreviewPane.vue`
- Modify: `src/components/PreviewEditPanel.vue`
- Modify: `src/components/MetadataLookupModal.vue`
- Modify: `src/components/ItemDetailModal.vue`
- Modify: `src/components/ItemCategoryModal.vue`
- Modify: `src/components/FolderDetailModal.vue`
- Modify: `src/components/CategoryManageModal.vue`
- Modify: `src/components/ScanWizardModal.vue`
- Modify: `src/components/SettingsPanel.vue`
- Modify: `src/components/FileHealthView.vue`
- Modify: `src/style.css`
- Modify: `src/themes.css`

**Interfaces:**

- Consumes: existing preview width composable, PreviewPane props/emits, settings and health data flows.
- Produces: `.inspector-panel`, `.inspector-resizer`, `.page-shell`, responsive overlay behavior; no API or event signature changes.

- [ ] **Step 1: Write the failing Inspector test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Archive Workbench Inspector', () => {
  const gallery = readFileSync(new URL('./ItemGallery.vue', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('./PreviewPane.vue', import.meta.url), 'utf8');
  const modalSources = [
    'MetadataLookupModal.vue', 'ItemDetailModal.vue', 'ItemCategoryModal.vue',
    'FolderDetailModal.vue', 'CategoryManageModal.vue', 'ScanWizardModal.vue',
  ].map(file => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'));

  it('names and exposes the Inspector region', () => {
    expect(gallery).toContain('class="inspector-resizer"');
    expect(preview).toContain('class="preview-pane inspector-panel"');
    expect(preview).toContain('aria-label="項目 Inspector"');
  });

  it('uses an accessible Inspector toggle', () => {
    expect(gallery).toContain('aria-label="切換 Inspector"');
    expect(gallery).toContain('<AppIcon');
  });

  it('uses one modal surface across editing workflows', () => {
    for (const source of modalSources) expect(source).toContain('workbench-modal');
  });
});
```

- [ ] **Step 2: Run the Inspector test and verify it fails**

Run: `npm test -- src/components/ItemGallery.inspector.test.ts`

Expected: FAIL because the Inspector naming and icon toggle are absent.

- [ ] **Step 3: Convert PreviewPane into the Inspector**

Add `class="preview-pane inspector-panel"` and `aria-label="項目 Inspector"`. Keep `item`, `allTags`, `initialTab`, tag click, updated, tagsChanged, deleted and close contracts. Organize the template into `.inspector-media`, `.inspector-identity`, `.inspector-tabs`, `.inspector-content`, and `.inspector-actions`; reuse `PreviewEditPanel` rather than creating another editor.

In ItemGallery rename only visual classes: `.preview-toggle-btn` -> `.inspector-toggle`, `.resizer` -> `.inspector-resizer`; use `AppIcon name="panel-right"`, `aria-label="切換 Inspector"`, and `aria-pressed`. Preserve `togglePreview`, `startResizing`, `previewWidth`, `isPreviewOpen` and reader restore behavior.

- [ ] **Step 4: Align settings and file health**

Add `.page-shell` and common `.page-header`, `.page-kicker`, `.page-title`, `.page-copy` class names to SettingsPanel and FileHealthView while keeping their component-local layouts and handlers. Replace decorative status emoji in FileHealthView with `AppIcon name="check"`; retain all lists and buttons.

- [ ] **Step 5: Align modal surfaces without changing workflows**

Add `workbench-modal` to the primary dialog container in MetadataLookupModal, ItemDetailModal, ItemCategoryModal, FolderDetailModal, CategoryManageModal and ScanWizardModal. Add `surface-popover` only where a nested popup already exists. Keep every prop, emit, loading state, form field, provider action and close behavior unchanged; normalize only header spacing, border, surface, footer actions and focus-visible styling through shared tokens.

- [ ] **Step 6: Add responsive layout rules**

Implement exact breakpoints:

```css
@media (max-width: 1279px) {
  .context-sidebar { width: 228px; }
  .inspector-panel { max-width: 340px; }
}

@media (max-width: 959px) {
  .primary-rail { width: 64px; }
  .context-sidebar { position: fixed; left: 64px; top: 0; bottom: 0; z-index: 300; box-shadow: var(--shadow-modal); }
  .inspector-panel { position: fixed; right: 0; top: 0; bottom: 0; z-index: 320; width: min(360px, calc(100vw - 64px)) !important; }
}
```

The default 1440×900 layout keeps all four regions. Do not add mobile-specific product behavior.

- [ ] **Step 7: Run focused and complete verification**

Run: `npm test -- src/components/ItemGallery.inspector.test.ts src/components/ItemGallery.readerRestore.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

Run: `npm run lint:css`

Expected: exit 0.

Run: `npm run build`

Expected: Vite production build succeeds and build stamp updates are visible for review.

- [ ] **Step 8: Commit completed redesign**

```powershell
git add src/components/ItemGallery.vue src/components/PreviewPane.vue src/components/PreviewEditPanel.vue src/components/MetadataLookupModal.vue src/components/ItemDetailModal.vue src/components/ItemCategoryModal.vue src/components/FolderDetailModal.vue src/components/CategoryManageModal.vue src/components/ScanWizardModal.vue src/components/SettingsPanel.vue src/components/FileHealthView.vue src/components/ItemGallery.inspector.test.ts src/style.css src/themes.css index.html src-tauri/tauri.conf.json
git commit -m "feat: complete archive workbench redesign"
```

---

### Task 6: Visual QA, final verification and branch publication

**Files:**

- Modify if QA finds defects: only files already listed in Tasks 1–5.
- Verify: all files changed on `codex/archive-workbench-redesign` since `main`.

**Interfaces:**

- Consumes: completed Archive Workbench implementation.
- Produces: verified commits and remote branch `origin/codex/archive-workbench-redesign`; `main` remains untouched.

- [ ] **Step 1: Run the app for visual QA**

Run the Vite target on `127.0.0.1:5173`, inspect it with the in-app browser at 1440×900, and capture workspace plus settings states. Verify DOM labels and screenshots before interacting.

Check:

- primary rail labels and active state;
- context sidebar and content canvas hierarchy;
- command bar, empty state and Inspector toggle;
- settings and file-health page shell;
- focus-visible states and no clipped controls at 1280px, 1024px and 959px.

- [ ] **Step 2: Fix only observed visual defects and rerun focused tests**

For every defect, add or strengthen the nearest source-contract test when practical, apply the minimal CSS/template correction, then run that test. Do not introduce new product behavior during QA.

- [ ] **Step 3: Run final verification from a clean test state**

Run:

```powershell
npm test
npm run lint:css
npm run build
git diff --check main...HEAD
git status --short --branch
```

Expected: all tests pass, CSS lint exits 0, build succeeds, diff check is clean, and only expected build stamp changes remain.

- [ ] **Step 4: Review branch diff and commit QA corrections**

Run:

```powershell
git diff --stat main...HEAD
git diff --name-status main...HEAD
git status --short
```

If QA corrections exist:

```powershell
git add -u -- src index.html src-tauri/tauri.conf.json
git commit -m "fix: polish archive workbench responsive states"
```

- [ ] **Step 5: Push the feature branch without touching main**

Run:

```powershell
git push -u origin codex/archive-workbench-redesign
```

Expected: remote branch is created or fast-forwarded; `main` and `origin/main` remain at their original commit.

- [ ] **Step 6: Run the final packaged build after push**

Run: `npm run tauri:build`

Expected: the repo guard stops only repo-owned blockers, Tauri packaged build succeeds, and the branch worktree remains clean. Do not make a GitNexus stats-only commit after push.
