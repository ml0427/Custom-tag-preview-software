import { describe, expect, it, vi } from 'vitest';
import { useThumbnailLoader } from './useThumbnailLoader';
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
});
