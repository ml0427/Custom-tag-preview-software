import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { api } from './api';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe('api', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('passes pagination and filter arguments to get_items', async () => {
    invokeMock.mockResolvedValueOnce({
      content: [],
      totalPages: 0,
      totalElements: 0,
      number: 1,
      size: 50,
    });

    await api.getItems(1, 50, [2, 3], 'name', 'asc', 'C:/Library', 'file');

    expect(invokeMock).toHaveBeenCalledWith('get_items', {
      page: 1,
      size: 50,
      tagIds: [2, 3],
      sortBy: 'name',
      sortDir: 'asc',
      sourcePath: 'C:/Library',
      itemType: 'file',
    });
  });

  it('defaults untrackItem allowMissing to false', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await api.untrackItem('C:/Library/missing.zip');

    expect(invokeMock).toHaveBeenCalledWith('untrack_item', {
      path: 'C:/Library/missing.zip',
      allowMissing: false,
    });
  });

  it('can request removing a missing tracked item', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await api.untrackItem('C:/Library/missing.zip', { allowMissing: true });

    expect(invokeMock).toHaveBeenCalledWith('untrack_item', {
      path: 'C:/Library/missing.zip',
      allowMissing: true,
    });
  });

  it('defaults trashItem allowMissing to false', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await api.trashItem('C:/Library/book.zip');

    expect(invokeMock).toHaveBeenCalledWith('trash_item', {
      path: 'C:/Library/book.zip',
      allowMissing: false,
    });
  });

  it('can trash an untracked filesystem item without requiring a DB row', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await api.trashItem('C:/Library/new.zip', { allowMissing: true });

    expect(invokeMock).toHaveBeenCalledWith('trash_item', {
      path: 'C:/Library/new.zip',
      allowMissing: true,
    });
  });
});
