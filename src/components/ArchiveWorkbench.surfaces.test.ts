import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Archive Workbench content surfaces', () => {
  const card = readFileSync(new URL('./ThumbnailCard.vue', import.meta.url), 'utf8');
  const table = readFileSync(new URL('./FileExplorerTable.vue', import.meta.url), 'utf8');
  const toast = readFileSync(new URL('./ToastContainer.vue', import.meta.url), 'utf8');

  it('uses shared gallery surface names', () => {
    expect(card).toContain('archive-card');
    expect(table).toContain('archive-table');
    expect(table).toContain('surface-popover');
  });

  it('keeps feedback inside workbench cards', () => {
    expect(toast).toContain('toast-card');
    expect(toast).toContain('confirm-card');
  });
});
