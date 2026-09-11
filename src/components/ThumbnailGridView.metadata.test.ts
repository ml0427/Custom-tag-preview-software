import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ThumbnailGridView metadata loading', () => {
  const source = readFileSync(new URL('./ThumbnailGridView.vue', import.meta.url), 'utf8');
  const cardSource = readFileSync(new URL('./ThumbnailCard.vue', import.meta.url), 'utf8');
  const tableSource = readFileSync(new URL('./FileExplorerTable.vue', import.meta.url), 'utf8');

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

  it('keeps the gallery cover independent from card chrome and uses token based selection', () => {
    expect(cardSource).toContain('aspect-ratio: 3 / 4');
    expect(cardSource).toContain('background: transparent');
    expect(cardSource).toContain('outline: 2px solid var(--accent)');
    expect(cardSource).toContain('height: var(--thumb-info-height, 74px)');
    expect(cardSource).toContain('font-size: 0.875rem');
  });

  it('keeps the file list aligned with comfortable row spacing', () => {
    expect(tableSource).toContain('height: 56px');
    expect(tableSource).toContain('font-size: 0.875rem');
    expect(tableSource).toContain('background: transparent');
  });
});
