import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Archive Workbench Inspector', () => {
  const gallery = readFileSync(new URL('./ItemGallery.vue', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('./PreviewPane.vue', import.meta.url), 'utf8');
  const detailForm = readFileSync(new URL('./DetailFormLayout.vue', import.meta.url), 'utf8');
  const modalSources = [
    'MetadataLookupModal.vue',
    'ItemDetailModal.vue',
    'ItemCategoryModal.vue',
    'FolderDetailModal.vue',
    'CategoryManageModal.vue',
    'ScanWizardModal.vue',
  ].map(file => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'));

  it('names and exposes the Inspector region', () => {
    expect(preview).toContain('class="preview-pane inspector-panel"');
    expect(preview).toContain('aria-label="項目 Inspector"');
  });

  it('opens item details from both gallery views', () => {
    expect(gallery.match(/@showDetails="openDetails"/g)).toHaveLength(2);
  });

  it('removes the global details toggle now that items own the action', () => {
    expect(gallery).not.toContain('class="details-button"');
    expect(gallery).not.toContain('class="inspector-toggle"');
  });

  it('keeps the gallery header compact and contextual', () => {
    expect(gallery).toContain('class="workspace-breadcrumb"');
    expect(gallery).not.toContain('class="workspace-count"');
    expect(gallery).not.toContain('class="workspace-index"');
    expect(gallery).not.toContain('class="workspace-kicker"');
  });

  it('wires the resizer active state from the preview resize composable', () => {
    const match = gallery.match(/const\s*\{(?<body>[\s\S]*?)\}\s*=\s*useGalleryPreviewResize\(\)/);
    expect(match?.groups?.body).toContain('isResizing');
  });

  it('uses one modal surface across editing workflows', () => {
    for (const source of modalSources) {
      expect(source).toContain('workbench-modal');
    }
  });

  it('forwards detail modal attributes to the dialog surface instead of the backdrop', () => {
    expect(detailForm).toContain('defineOptions({ inheritAttrs: false })');
    expect(detailForm).toContain('class="modal-content workbench-modal" v-bind="$attrs"');
  });
});
