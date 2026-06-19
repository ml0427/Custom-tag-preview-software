import { describe, expect, it } from 'vitest';
import type { Item } from '../api';
import { getPreviewEditCapabilities } from './previewEdit';

const item = (overrides: Partial<Item>): Item => ({
  id: 1,
  path: 'C:/Library/book.zip',
  itemType: 'file',
  name: 'book.zip',
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

describe('getPreviewEditCapabilities', () => {
  it('enables file editing fields without folder-only automation', () => {
    expect(getPreviewEditCapabilities(item({ itemType: 'file' }))).toEqual({
      canEditName: true,
      canEditTags: true,
      canEditNote: false,
      canEditCategory: true,
      canEditFolderRules: false,
      canEditCoverImages: true,
    });
  });

  it('enables folder note and automation fields without file-only category or cover images', () => {
    expect(getPreviewEditCapabilities(item({
      itemType: 'folder',
      path: 'C:/Library/Series',
      name: 'Series',
      fileSize: null,
      category: null,
    }))).toEqual({
      canEditName: true,
      canEditTags: true,
      canEditNote: true,
      canEditCategory: false,
      canEditFolderRules: true,
      canEditCoverImages: false,
    });
  });
});
