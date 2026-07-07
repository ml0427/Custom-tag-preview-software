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

  it('captures the current gallery position before opening the reader', () => {
    expect(gallerySource).toContain('captureScrollPosition: () => void');
    expect(gallerySource).toContain('const captureGalleryScrollPosition = () =>');
    expect(gallerySource).toContain('captureGalleryScrollPosition();\n    readerItem.value =');
  });

  it('does not let reader-open scroll events overwrite the saved gallery position', () => {
    expect(gallerySource).toContain('const handleScrollPositionChange = (stateKey: string, scrollTop: number) => {');
    expect(gallerySource).toContain('if (readerItem.value) return;');
    expect(gallerySource).toContain('setScrollTop(stateKey, scrollTop);');
  });

  it('exposes scroll restore hooks from both gallery views', () => {
    expect(tableSource).toContain('restoreScrollPosition');
    expect(gridSource).toContain('restoreScrollPosition');
  });

  it('exposes scroll capture hooks from both gallery views', () => {
    expect(tableSource).toContain('defineExpose({ restoreScrollPosition, captureScrollPosition })');
    expect(gridSource).toContain('defineExpose({ restoreScrollPosition, captureScrollPosition })');
  });
});
