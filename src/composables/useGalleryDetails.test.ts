import { computed, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { FileItem, Item } from '../api';
import { pathKey } from '../utils/pathKey';
import { useGalleryDetails } from './useGalleryDetails';
import { useGallerySelection } from './useGallerySelection';

const first: FileItem = { name: 'book.zip', path: 'C:/Library/book.zip', isDir: false, fileSize: 1, modifiedTime: '', extension: 'zip' };
const second: FileItem = { ...first, path: 'C:/Library/other.zip', name: 'other.zip' };
const dbItem = { id: 1, path: first.path, name: first.name } as Item;

function setup(existing = true) {
  const itemByPath = computed(() => new Map<string, Item>(existing ? [[pathKey(first.path), dbItem]] : []));
  const selection = useGallerySelection(computed(() => [first, second]), itemByPath);
  const options = {
    itemByPath,
    previewTab: ref<'info' | 'edit'>('edit'),
    isPreviewOpen: ref(false),
    selectItem: selection.handleFileItemClick,
    importItem: vi.fn<(path: string) => Promise<Item>>().mockResolvedValue(dbItem),
    reloadItems: vi.fn().mockResolvedValue(undefined),
    onError: vi.fn(),
  };
  return { ...useGalleryDetails(options), options, selection };
}

describe('gallery item details', () => {
  it('selects only the requested item and opens its information tab', async () => {
    const { openDetails, options, selection } = setup();
    selection.handleFileItemClick(second);
    selection.handleFileItemClick(first, { ctrlKey: true } as MouseEvent);
    await openDetails(first);
    expect(selection.selectedPaths.value).toEqual([first.path]);
    expect(selection.selectedItem.value).toEqual(dbItem);
    expect(options.previewTab.value).toBe('info');
    expect(options.isPreviewOpen.value).toBe(true);
    expect(options.importItem).not.toHaveBeenCalled();
  });

  it('imports the exact untracked path before refreshing details', async () => {
    const { openDetails, options } = setup(false);
    await openDetails(first);
    expect(options.importItem).toHaveBeenCalledWith(first.path);
    expect(options.reloadItems).toHaveBeenCalledOnce();
  });

  it('does not restore an old selection or reopen a panel after import finishes', async () => {
    const { openDetails, options, selection } = setup(false);
    let resolve!: (item: Item) => void;
    options.importItem.mockReturnValue(new Promise<Item>(done => { resolve = done; }));
    const pending = openDetails(first);
    selection.handleFileItemClick(second);
    options.isPreviewOpen.value = false;
    resolve(dbItem);
    await pending;
    expect(selection.selectedFileItemPath.value).toBe(second.path);
    expect(options.isPreviewOpen.value).toBe(false);
  });

  it('reports an import failure instead of rejecting the UI event', async () => {
    const { openDetails, options } = setup(false);
    const error = new Error('import failed');
    options.importItem.mockRejectedValue(error);
    await expect(openDetails(first)).resolves.toBeUndefined();
    expect(options.onError).toHaveBeenCalledWith(error);
    expect(options.reloadItems).not.toHaveBeenCalled();
  });
});
