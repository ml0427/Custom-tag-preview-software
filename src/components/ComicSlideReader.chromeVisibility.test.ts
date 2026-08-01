import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ComicSlideReader chrome visibility', () => {
  const source = readFileSync(new URL('./ComicSlideReader.vue', import.meta.url), 'utf8');

  it('starts fullscreen chrome hidden and hides it shortly after mouse movement stops', () => {
    expect(source).toContain('const CHROME_HIDE_DELAY_MS = 160');
    expect(source).toContain('readerChromeVisible.value = !isFullscreen.value');
    expect(source).toContain('readerChromeVisible.value = !fullscreen');
    expect(source).toContain('}, CHROME_HIDE_DELAY_MS);');
    expect(source).not.toContain('}, 1800);');
  });

  it('reveals the top and bottom chrome from reader mouse movement', () => {
    expect(source).toContain('@mousemove="showReaderChrome"');
    expect(source).toContain('@mouseenter="showReaderChrome"');
    expect(source).toContain('@mousemove.stop="holdReaderChrome"');
    expect(source).toContain('@mouseenter="holdReaderChrome"');
  });
});
