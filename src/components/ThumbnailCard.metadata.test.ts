import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ThumbnailCard metadata badges', () => {
  const source = readFileSync(new URL('./ThumbnailCard.vue', import.meta.url), 'utf8');

  it('renders an archive page count badge when a page count is available', () => {
    expect(source).toContain('pageCount?: number | null');
    expect(source).toContain('pageCount && pageCount > 0');
    expect(source).toContain('{{ pageCount }} 頁');
  });

  it('renders the open count only when frequent mode asks for it', () => {
    expect(source).toContain('showOpenCount?: boolean');
    expect(source).toContain('openCount?: number');
    expect(source).toContain('showOpenCount && openCount && openCount > 0');
    expect(source).toContain('使用 {{ openCount }} 次');
  });
});
