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
