import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ThumbnailGridView metadata loading', () => {
  const source = readFileSync(new URL('./ThumbnailGridView.vue', import.meta.url), 'utf8');

  it('loads archive page counts lazily for visible thumbnail cards', () => {
    expect(source).toContain('archivePageCounts');
    expect(source).toContain('loadArchivePageCount');
    expect(source).toContain('enqueueArchivePageCount(item)');
  });

  it('marks empty or failed archive page-count checks as resolved', () => {
    expect(source).toContain('reactive(new Map<string, number | null>())');
    expect(source).toContain('archivePageCounts.set(path, count)');
    expect(source).toContain('canLoadArchivePageCount(item)');
  });

  it('passes page count and open count metadata to each thumbnail card', () => {
    expect(source).toContain(':pageCount="archivePageCounts.get(item.path) ?? null"');
    expect(source).toContain(':showOpenCount="showOpenCount"');
    expect(source).toContain(':openCount="getDbItem(item, itemByPath)?.openCount ?? 0"');
  });

  it('keeps every responsive thumbnail row at an even column count', () => {
    const columnCounts = [...source.matchAll(/grid-template-columns:\s*repeat\((\d+),/g)]
      .map(match => Number(match[1]));

    expect(columnCounts.length).toBeGreaterThan(0);
    expect(columnCounts.every(count => count % 2 === 0)).toBe(true);
    expect(source).not.toContain('repeat(auto-fill');
  });
});
