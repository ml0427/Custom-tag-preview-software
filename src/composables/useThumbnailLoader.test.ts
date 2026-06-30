import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThumbnailLoader } from './useThumbnailLoader';
import { api } from '../api';
import type { FileItem, Item } from '../api';
import { pathKey } from '../utils/pathKey';

vi.mock('./useItemTypes', () => ({
  useItemTypes: () => ({
    getTypeConfig: (name?: string | null) => ({
      icon: name === 'comic' ? 'comic-icon' : 'default-icon',
      displayName: name === 'comic' ? '漫畫' : '一般',
      color: name === 'comic' ? '#f0b229' : null,
    }),
    getTypeByExtension: () => null,
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string, protocol = 'asset') => `http://${protocol}.localhost/${path}`,
}));

vi.mock('../api', () => ({
  api: {
    getArchiveImagesByPath: vi.fn(),
  },
}));

const apiMock = vi.mocked(api);

const fileItem = (path: string): FileItem => ({
  name: path.split(/[\\/]/).pop() ?? path,
  path,
  isDir: false,
  fileSize: 100,
  modifiedTime: '2026-05-21 10:00',
  extension: 'zip',
});

const dbItem = (path: string): Item => ({
  id: 42,
  path,
  itemType: 'file',
  name: 'book',
  fileSize: 100,
  fileModifiedAt: 1_779_340_800,
  coverCachePath: null,
  fingerprint: null,
  note: null,
  category: 'comic',
  existsOnDisk: true,
  missingSince: null,
  lastSeenAt: '2026-05-21T10:00:00Z',
  importAt: '2026-05-21T10:00:00Z',
  tags: [{ id: 7, name: 'Action', color: '#f0b229' }],
});

describe('useThumbnailLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('looks up DB items with normalized path keys for list and grid views', () => {
    const loader = useThumbnailLoader();
    const itemByPath = new Map<string, Item>([
      [pathKey('C:/Library/book.zip'), dbItem('C:/Library/book.zip')],
    ]);

    const item = loader.getDbItem(fileItem('C:\\Library\\book.zip'), itemByPath);

    expect(item?.tags).toEqual([{ id: 7, name: 'Action', color: '#f0b229' }]);
  });

  it('keeps category helpers consistent with the same normalized DB lookup', () => {
    const loader = useThumbnailLoader();
    const itemByPath = new Map<string, Item>([
      [pathKey('C:/Library/book.zip'), dbItem('C:/Library/book.zip')],
    ]);
    const item = fileItem('C:\\Library\\book.zip');

    expect(loader.hasCategoryAssigned(item, itemByPath)).toBe(true);
    expect(loader.getItemType(item, itemByPath)).toBe('漫畫');
    expect(loader.getTypeColor(item, itemByPath)).toBe('#f0b229');
  });

  it('adds a stable cache-busting query to comic-cache thumbnail urls', () => {
    const loader = useThumbnailLoader();
    const item = {
      ...dbItem('C:/Library/book.zip'),
      id: 326,
      coverCachePath: '001.webp',
    };

    const url = loader.buildThumbCacheUrl(item);

    expect(url).toBe(
      'http://comic-cache.localhost/326.jpg?v=001.webp%7C1779340800%7CC%3A%2FLibrary%2Fbook.zip'
    );
  });

  it('counts readable zip archive pages from the archive image list', async () => {
    apiMock.getArchiveImagesByPath.mockResolvedValueOnce([
      'pages/001.jpg',
      'pages/002.jpg',
      'pages/003.png',
    ]);
    const loader = useThumbnailLoader();

    const count = await loader.loadArchivePageCount(fileItem('C:/Library/book.zip'));

    expect(apiMock.getArchiveImagesByPath).toHaveBeenCalledWith('C:/Library/book.zip');
    expect(count).toBe(3);
  });

  it('does not show an archive page count for folders, unsupported files, or empty archives', async () => {
    apiMock.getArchiveImagesByPath.mockResolvedValueOnce([]);
    const loader = useThumbnailLoader();

    expect(await loader.loadArchivePageCount({ ...fileItem('C:/Library'), isDir: true })).toBeNull();
    expect(await loader.loadArchivePageCount({ ...fileItem('C:/Library/readme.txt'), extension: 'txt' })).toBeNull();
    expect(await loader.loadArchivePageCount(fileItem('C:/Library/empty.zip'))).toBeNull();
    expect(apiMock.getArchiveImagesByPath).toHaveBeenCalledTimes(1);
  });

  it('identifies only zip and cbz archives as page-count candidates', () => {
    const loader = useThumbnailLoader();

    expect(loader.canLoadArchivePageCount(fileItem('C:/Library/book.zip'))).toBe(true);
    expect(loader.canLoadArchivePageCount({ ...fileItem('C:/Library/book.cbz'), extension: 'cbz' })).toBe(true);
    expect(loader.canLoadArchivePageCount({ ...fileItem('C:/Library/book.rar'), extension: 'rar' })).toBe(false);
    expect(loader.canLoadArchivePageCount({ ...fileItem('C:/Library'), isDir: true })).toBe(false);
  });
});
