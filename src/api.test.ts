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
      includeMissing: false,
    });
  });

  it('can request missing items for reconciliation views', async () => {
    invokeMock.mockResolvedValueOnce({
      content: [],
      totalPages: 0,
      totalElements: 0,
      number: 0,
      size: 100,
    });

    await api.getItems(0, 100, undefined, 'importAt', 'desc', 'C:/Library', undefined, true);

    expect(invokeMock).toHaveBeenCalledWith('get_items', {
      page: 0,
      size: 100,
      tagIds: undefined,
      sortBy: 'importAt',
      sortDir: 'desc',
      sourcePath: 'C:/Library',
      itemType: undefined,
      includeMissing: true,
    });
  });

  it('returns add source import counts', async () => {
    invokeMock.mockResolvedValueOnce({
      source: { id: 1, path: 'C:/Library', lastSync: null },
      importedCount: 3,
    });

    const result = await api.addSource('C:/Library');

    expect(invokeMock).toHaveBeenCalledWith('add_source', { path: 'C:/Library' });
    expect(result.importedCount).toBe(3);
  });

  it('returns remove source cleanup counts', async () => {
    invokeMock.mockResolvedValueOnce({ removedCount: 4 });

    const result = await api.removeSource(1);

    expect(invokeMock).toHaveBeenCalledWith('remove_source', { id: 1 });
    expect(result.removedCount).toBe(4);
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

  it('loads metadata provider definitions', async () => {
    invokeMock.mockResolvedValueOnce([
      {
        id: 'wnacg',
        displayName: 'WNACG',
        adult: true,
        supportsSearch: true,
        supportsLookupByUrl: true,
        supportsLookupById: true,
        parserVersion: 'test',
      },
    ]);

    const providers = await api.getMetadataProviders();

    expect(invokeMock).toHaveBeenCalledWith('get_metadata_providers');
    expect(providers[0].id).toBe('wnacg');
  });

  it('passes metadata lookup input to the backend', async () => {
    invokeMock.mockResolvedValueOnce({
      candidates: [],
      messages: [],
    });

    const input = {
      name: 'book.zip',
      path: 'C:/Library/book.zip',
      existingTags: ['artist-a'],
      providerIds: ['wnacg', 'hitomi'],
      query: 'book',
      allowAdult: true,
      limit: 5,
    };

    await api.lookupMetadata(input);

    expect(invokeMock).toHaveBeenCalledWith('lookup_metadata', { input });
  });
});
