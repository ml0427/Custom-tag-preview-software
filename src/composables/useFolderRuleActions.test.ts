import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type FileItem, type FolderRulePreset, type Item, type ItemType, type TagRuleInput } from '../api';
import { pathKey } from '../utils/pathKey';
import { useFolderRuleActions } from './useFolderRuleActions';

vi.mock('../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      quickImportItem: vi.fn(),
      getFolderRulePreset: vi.fn(),
      applyRulesToItem: vi.fn(),
    },
  };
});

const apiMock = vi.mocked(api);

const item = (overrides: Partial<Item>): Item => ({
  id: 1,
  path: 'C:/Library',
  itemType: 'folder',
  name: 'Library',
  fileSize: null,
  fileModifiedAt: null,
  coverCachePath: null,
  fingerprint: null,
  note: null,
  category: null,
  existsOnDisk: true,
  missingSince: null,
  lastSeenAt: null,
  importAt: '2026-06-17T00:00:00Z',
  tags: [],
  ...overrides,
});

const fileItem = (overrides: Partial<FileItem>): FileItem => ({
  name: 'book.zip',
  path: 'C:/Library/book.zip',
  isDir: false,
  fileSize: 1024,
  modifiedTime: '2026-06-17 20:00',
  extension: 'zip',
  ...overrides,
});

const tagRules: TagRuleInput[] = [
  {
    name: 'comic-name',
    matchType: 'contains',
    pattern: 'book',
    tagName: '漫畫',
  },
];

const itemType = (overrides: Partial<ItemType>): ItemType => ({
  id: 7,
  name: 'comic',
  icon: 'C',
  displayName: '漫畫',
  color: null,
  example: 'book.zip',
  isBuiltin: false,
  extensions: ['zip'],
  tagRules,
  ...overrides,
});

const folderPreset = (overrides: Partial<FolderRulePreset>): FolderRulePreset => ({
  folderItemId: 1,
  presetTypeId: 7,
  presetName: 'comic',
  presetDisplayName: '漫畫',
  presetIcon: 'C',
  applyToSubfolders: false,
  applyToFiles: false,
  fileExtensions: [],
  ...overrides,
});

describe('useFolderRuleActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.applyRulesToItem.mockResolvedValue({ added: 0, updated: 0, removed: 0, tagged: 2 });
  });

  it('falls back to the nearest parent folder preset when a child ZIP has no category rule set', async () => {
    const parentFolder = item({ id: 10, path: 'C:/Library', itemType: 'folder' });
    const zipItem = item({
      id: 20,
      path: 'C:/Library/book.zip',
      itemType: 'file',
      name: 'book.zip',
      category: null,
    });
    const items = new Map<string, Item>([
      [pathKey(parentFolder.path), parentFolder],
      [pathKey(zipItem.path), zipItem],
    ]);
    const hideContextMenu = vi.fn();
    const showToast = vi.fn();
    const onApplied = vi.fn();
    const comicType = itemType({ id: 7, name: 'comic', tagRules });

    apiMock.getFolderRulePreset.mockResolvedValueOnce(folderPreset({ folderItemId: 10, presetTypeId: 7 }));

    const { applyRulesForItem } = useFolderRuleActions(
      () => items,
      () => [itemType({ id: 1, name: 'default', tagRules: [] }), comicType],
      showToast,
      hideContextMenu,
      onApplied,
    );

    await applyRulesForItem(fileItem({ path: 'C:/Library/book.zip' }));

    expect(hideContextMenu).toHaveBeenCalledTimes(1);
    expect(apiMock.getFolderRulePreset).toHaveBeenCalledWith(10);
    expect(apiMock.applyRulesToItem).toHaveBeenCalledWith(20, tagRules);
    expect(showToast).toHaveBeenCalledWith('已套用 2 個標籤', 'success');
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('keeps the no-rule message when neither the item nor parent folder has usable rules', async () => {
    const parentFolder = item({ id: 10, path: 'C:/Library', itemType: 'folder' });
    const zipItem = item({
      id: 20,
      path: 'C:/Library/book.zip',
      itemType: 'file',
      name: 'book.zip',
      category: null,
    });
    const items = new Map<string, Item>([
      [pathKey(parentFolder.path), parentFolder],
      [pathKey(zipItem.path), zipItem],
    ]);
    const showToast = vi.fn();

    apiMock.getFolderRulePreset.mockResolvedValueOnce(null);

    const { applyRulesForItem } = useFolderRuleActions(
      () => items,
      () => [itemType({ id: 1, name: 'default', tagRules: [] })],
      showToast,
      vi.fn(),
    );

    await applyRulesForItem(fileItem({ path: 'C:/Library/book.zip' }));

    expect(apiMock.applyRulesToItem).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('此項目沒有可套用的標籤規則集', 'info');
  });
});
