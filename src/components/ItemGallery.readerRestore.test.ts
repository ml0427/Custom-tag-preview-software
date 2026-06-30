import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ItemGallery reader close scroll restore', () => {
  const gallerySource = readFileSync(new URL('./ItemGallery.vue', import.meta.url), 'utf8');
  const tableSource = readFileSync(new URL('./FileExplorerTable.vue', import.meta.url), 'utf8');
  const gridSource = readFileSync(new URL('./ThumbnailGridView.vue', import.meta.url), 'utf8');

  it('restores the active gallery scroll position after the reader closes', () => {
    expect(gallerySource).toContain('const restoreGalleryScrollPosition = () =>');
    expect(gallerySource).toContain('const handleReaderClose = () =>');
    expect(gallerySource).toContain('readerItem.value = null');
    expect(gallerySource).toContain('restoreGalleryScrollPosition()');
    expect(gallerySource).toContain('@close="handleReaderClose"');
  });

  it('exposes scroll restore hooks from both gallery views', () => {
    expect(tableSource).toContain('defineExpose({ restoreScrollPosition })');
    expect(gridSource).toContain('defineExpose({ restoreScrollPosition })');
  });
});
