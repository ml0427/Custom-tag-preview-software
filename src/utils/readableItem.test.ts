import { describe, expect, it } from 'vitest';
import type { FileItem, Item } from '../api';
import { isComicFolderItem, isReadableArchiveItem, isReadableFileItem } from './readableItem';

const fileItem = (overrides: Partial<FileItem> = {}): FileItem => ({
  name: 'book.zip',
  path: 'C:/Library/book.zip',
  isDir: false,
  fileSize: 100,
  modifiedTime: '2026-05-28 10:00',
  extension: 'zip',
  ...overrides,
});

const dbItem = (overrides: Partial<Item> = {}): Item => ({
  id: 1,
  path: 'C:/Library/book.zip',
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
  lastSeenAt: '2026-05-28T10:00:00Z',
  importAt: '2026-05-28T10:00:00Z',
  tags: [],
  ...overrides,
});

describe('readableItem', () => {
  it('treats zip and cbz files as readable archives', () => {
    expect(isReadableArchiveItem(fileItem({ extension: 'zip' }))).toBe(true);
    expect(isReadableArchiveItem(fileItem({ extension: 'CBZ' }))).toBe(true);
    expect(isReadableArchiveItem(fileItem({ extension: 'rar' }))).toBe(false);
  });

  it('treats only comic-category folders as readable folders', () => {
    expect(isComicFolderItem(dbItem({ itemType: 'folder', category: 'comic' }))).toBe(true);
    expect(isComicFolderItem(dbItem({ itemType: 'folder', category: 'default' }))).toBe(false);
    expect(isComicFolderItem(dbItem({ itemType: 'file', category: 'comic' }))).toBe(false);
  });

  it('shows the read action only for archives or comic folders', () => {
    expect(isReadableFileItem(fileItem({ extension: 'zip' }))).toBe(true);
    expect(isReadableFileItem(fileItem({ extension: 'txt' }))).toBe(false);
    expect(isReadableFileItem(
      fileItem({ name: 'Series', path: 'C:/Library/Series', isDir: true, extension: null }),
      dbItem({ itemType: 'folder', category: 'comic' }),
    )).toBe(true);
  });
});
