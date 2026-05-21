import { computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useGallerySelection } from './useGallerySelection';
import type { FileItem, Item } from '../api';

const file = (index: number): FileItem => ({
  name: `item-${index}.zip`,
  path: `C:/Library/item-${index}.zip`,
  isDir: false,
  fileSize: index,
  modifiedTime: '2026-05-21 10:00',
  extension: 'zip',
});

const item = (path: string): Item => ({
  id: 1,
  path,
  itemType: 'file',
  name: path,
  fileSize: 1,
  fileModifiedAt: null,
  coverCachePath: null,
  fingerprint: null,
  note: null,
  category: 'default',
  existsOnDisk: true,
  missingSince: null,
  lastSeenAt: '2026-05-21T10:00:00Z',
  importAt: '2026-05-21T10:00:00Z',
  tags: [],
});

const mouse = (options: Partial<MouseEvent>) => options as MouseEvent;

describe('useGallerySelection', () => {
  it('replaces the shift range from the anchor instead of accumulating old ranges', () => {
    const files = ref(Array.from({ length: 15 }, (_, index) => file(index + 1)));
    const itemByPath = computed(() => new Map(files.value.map(file => [file.path.toLowerCase().replace(/\//g, '\\'), item(file.path)])));
    const selection = useGallerySelection(computed(() => files.value), itemByPath);

    selection.handleFileItemClick(files.value[4]);
    selection.handleFileItemClick(files.value[14], mouse({ shiftKey: true }));
    selection.handleFileItemClick(files.value[9], mouse({ shiftKey: true }));

    expect(selection.selectedPaths.value).toEqual(files.value.slice(4, 10).map(file => file.path));
  });
});
