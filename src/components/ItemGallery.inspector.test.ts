import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Archive Workbench Inspector', () => {
  const gallery = readFileSync(new URL('./ItemGallery.vue', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('./PreviewPane.vue', import.meta.url), 'utf8');
  const modalSources = [
    'MetadataLookupModal.vue',
    'ItemDetailModal.vue',
    'ItemCategoryModal.vue',
    'FolderDetailModal.vue',
    'CategoryManageModal.vue',
    'ScanWizardModal.vue',
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

  it('wires the resizer active state from the preview resize composable', () => {
    const match = gallery.match(/const\s*\{(?<body>[\s\S]*?)\}\s*=\s*useGalleryPreviewResize\(\)/);
    expect(match?.groups?.body).toContain('isResizing');
  });

  it('uses one modal surface across editing workflows', () => {
    for (const source of modalSources) {
      expect(source).toContain('workbench-modal');
    }
  });
});
