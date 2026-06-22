import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ComicSlideReader wheel target paging', () => {
  const source = readFileSync(new URL('./ComicSlideReader.vue', import.meta.url), 'utf8');

  it('waits 200ms after wheel target changes before loading the page', () => {
    expect(source).toContain('const WHEEL_TARGET_SETTLE_MS = 200');
    expect(source).toContain('targetPageIndex');
    expect(source).toContain('scheduleTargetPageLoad');
    expect(source).toContain('window.setTimeout(() => {');
    expect(source).toContain('void loadPageAt(targetPageIndex.value)');
  });

  it('uses wheel movement to select a target page instead of loading during wheel input', () => {
    expect(source).toContain('pageCount: pages.value.length');
    expect(source).toContain('targetPageIndex.value = result.targetPageIndex');
    expect(source).not.toContain('isLoading: isLoading.value');
    expect(source).not.toContain("if (result.direction === 'previous') goPrev()");
    expect(source).not.toContain("if (result.direction === 'next') goNext()");
  });
});
