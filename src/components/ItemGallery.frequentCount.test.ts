import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ItemGallery frequent count wiring', () => {
  const source = readFileSync(new URL('./ItemGallery.vue', import.meta.url), 'utf8');

  it('asks the thumbnail grid to show open counts while frequent mode is active', () => {
    expect(source).toContain(':showOpenCount="frequentMode"');
  });
});
