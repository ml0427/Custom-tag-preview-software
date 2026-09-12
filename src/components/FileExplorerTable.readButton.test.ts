import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('FileExplorerTable details button layout', () => {
  const source = readFileSync(new URL('./FileExplorerTable.vue', import.meta.url), 'utf8');

  it('centers the list details button label within its fixed button box', () => {
    const match = source.match(/\.row-details-btn\s*\{(?<body>[\s\S]*?)\n\}/);
    expect(match?.groups?.body).toBeTruthy();

    const body = match!.groups!.body;
    expect(body).toContain('display: inline-flex;');
    expect(body).toContain('align-items: center;');
    expect(body).toContain('justify-content: center;');
    expect(body).toContain('line-height: 1;');
    expect(body).toContain('padding: 0;');
  });
});
