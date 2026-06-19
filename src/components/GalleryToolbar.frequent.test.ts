import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('GalleryToolbar frequent mode control', () => {
  const source = readFileSync(new URL('./GalleryToolbar.vue', import.meta.url), 'utf8');

  it('declares a frequent mode model event', () => {
    expect(source).toContain('frequentMode');
    expect(source).toContain("update:frequentMode");
  });

  it('renders a frequent mode button beside the view controls', () => {
    expect(source).toContain('title="顯示常用項目"');
    expect(source).toContain('常用');
  });
});
