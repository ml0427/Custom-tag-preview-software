import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type FileItem, type FolderRulePreset, type Item, type ItemType, type Page, type TagRuleInput } from '../api';
import { computeExternalChanges, useExternalChanges } from './useExternalChanges';

vi.mock('../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      listDirFiles: vi.fn(),
      getItems: vi.fn(),
      getItemByPath: vi.fn(),
      quickImportItem: vi.fn(),
      setItemCategory: vi.fn(),
      getItemTypes: vi.fn(),
      getFolderRulePreset: vi.fn(),
      applyRulesToItem: vi.fn(),
      untrackItem: vi.fn(),
      incrementalScan: vi.fn(),
    },
  };
});

vi.mock('./useToast', () => ({
  useToast: () => ({
    show: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true),
  }),
}));

const apiMock = vi.mocked(api);

const fileItem = (overrides: Partial<FileItem>): FileItem => ({
  name: 'book.zip',
  path: 'C:/Library/book.zip',
  isDir: false,
  fileSize: 1024,
  modifiedTime: '2026-05-21T10:00:00.000Z',
  extension: 'zip',
  ...overrides,
});

const dbItem = (overrides: Partial<Item>): Item => ({
  id: 1,
  path: 'C:/Library/book.zip',
  itemType: 'file',
  name: 'book',
  fileSize: 1024,
  fileModifiedAt: Math.floor(new Date('2026-05-21T10:00:00.000Z').getTime() / 1000),
  coverCachePath: null,
  fingerprint: null,
  note: null,
  category: 'default',
  existsOnDisk: true,
  missingSince: null,
  lastSeenAt: '2026-05-21T10:00:00Z',
  importAt: '2026-05-21T10:00:00Z',
  tags: [],
  ...overrides,
});

const page = <T>(content: T[], totalPages = 1): Page<T> => ({
  content,
  totalPages,
  totalElements: content.length,
  number: 0,
  size: content.length,
});

const tagRules: TagRuleInput[] = [
  {
    name: 'comic-name',
    matchType: 'contains',
    pattern: 'new',
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
  folderItemId: 10,
  presetTypeId: 7,
  presetName: 'comic',
  presetDisplayName: '漫畫',
  presetIcon: 'C',
  applyToSubfolders: false,
  applyToFiles: false,
  fileExtensions: [],
  ...overrides,
});

describe('computeExternalChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects untracked filesystem entries', () => {
    const changes = computeExternalChanges('C:/Library', [
      fileItem({ path: 'C:/Library/new.zip', name: 'new.zip' }),
    ], []);

    expect(changes).toMatchObject([
      {
        kind: 'untracked',
        path: 'C:/Library/new.zip',
        name: 'new.zip',
        itemType: 'file',
      },
    ]);
  });

  it('detects missing direct children from the database', () => {
    const changes = computeExternalChanges('C:/Library', [], [
      dbItem({ path: 'C:/Library/missing.zip', name: 'missing' }),
      dbItem({ id: 2, path: 'C:/Library/Nested/child.zip', name: 'child' }),
    ]);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: 'missing',
      path: 'C:/Library/missing.zip',
      name: 'missing',
    });
  });

  it('detects modified file size or mtime drift', () => {
    const changes = computeExternalChanges('C:/Library', [
      fileItem({ fileSize: 2048 }),
      fileItem({
        path: 'C:/Library/later.zip',
        name: 'later.zip',
        modifiedTime: '2026-05-21T10:05:00.000Z',
      }),
    ], [
      dbItem({ fileSize: 1024 }),
      dbItem({
        id: 2,
        path: 'C:/Library/later.zip',
        name: 'later',
        fileModifiedAt: Math.floor(new Date('2026-05-21T10:00:00.000Z').getTime() / 1000),
      }),
    ]);

    expect(changes.map(change => change.kind)).toEqual(['modified', 'modified']);
  });

  it('normalizes Windows and POSIX path separators before comparing', () => {
    const changes = computeExternalChanges('C:/Library', [
      fileItem({ path: 'C:\\Library\\book.zip' }),
    ], [
      dbItem({ path: 'C:/Library/book.zip' }),
    ]);

    expect(changes).toEqual([]);
  });
});

describe('useExternalChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getItemTypes.mockResolvedValue([]);
    apiMock.getFolderRulePreset.mockResolvedValue(null);
    apiMock.applyRulesToItem.mockResolvedValue({ added: 0, updated: 0, removed: 0, tagged: 0 });
  });

  it('loads all DB pages before comparing filesystem changes', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([
      fileItem({ path: 'C:/Library/one.zip', name: 'one.zip' }),
      fileItem({ path: 'C:/Library/two.zip', name: 'two.zip' }),
    ]);
    apiMock.getItems
      .mockResolvedValueOnce(page([
        dbItem({ path: 'C:/Library/one.zip', name: 'one' }),
      ], 2))
      .mockResolvedValueOnce(page([
        dbItem({ id: 2, path: 'C:/Library/two.zip', name: 'two' }),
      ]));

    const externalChanges = useExternalChanges(() => 'C:/Library');

    await externalChanges.refresh();

    expect(apiMock.getItems).toHaveBeenNthCalledWith(1, 0, 1000, undefined, 'importAt', 'desc', 'C:/Library', undefined, true);
    expect(apiMock.getItems).toHaveBeenNthCalledWith(2, 1, 1000, undefined, 'importAt', 'desc', 'C:/Library', undefined, true);
    expect(externalChanges.changes.value).toEqual([]);
  });

  it('imports one untracked item without inheriting parent folder category', async () => {
    apiMock.getItemByPath.mockResolvedValueOnce(dbItem({
      id: 10,
      path: 'C:/Library',
      name: 'Library',
      itemType: 'folder',
      category: 'comic',
    }));
    apiMock.quickImportItem.mockResolvedValueOnce(dbItem({
      id: 20,
      path: 'C:/Library/new.zip',
      name: 'new.zip',
      category: 'default',
    }));
    apiMock.listDirFiles.mockResolvedValueOnce([]);
    apiMock.getItems.mockResolvedValueOnce(page([]));

    const externalChanges = useExternalChanges(() => 'C:/Library');

    await externalChanges.importOne('C:/Library/new.zip');

    expect(apiMock.quickImportItem).toHaveBeenCalledWith('C:/Library/new.zip');
    expect(apiMock.getItemByPath).not.toHaveBeenCalled();
    expect(apiMock.setItemCategory).not.toHaveBeenCalled();
    expect(apiMock.getItemTypes).not.toHaveBeenCalled();
    expect(apiMock.applyRulesToItem).not.toHaveBeenCalled();
  });

  it('applies parent folder preset rules when fixing an untracked child file', async () => {
    const parentFolder = dbItem({
      id: 10,
      path: 'C:/Library',
      name: 'Library',
      itemType: 'folder',
      fileSize: null,
      fileModifiedAt: null,
      category: 'default',
    });
    const importedItem = dbItem({
      id: 20,
      path: 'C:/Library/new.zip',
      name: 'new.zip',
      category: 'default',
    });

    apiMock.listDirFiles
      .mockResolvedValueOnce([
        fileItem({ path: 'C:/Library/new.zip', name: 'new.zip' }),
      ])
      .mockResolvedValueOnce([
        fileItem({ path: 'C:/Library/new.zip', name: 'new.zip' }),
      ]);
    apiMock.getItems
      .mockResolvedValueOnce(page([parentFolder]))
      .mockResolvedValueOnce(page([parentFolder, importedItem]));
    apiMock.quickImportItem.mockResolvedValueOnce(importedItem);
    apiMock.getFolderRulePreset.mockResolvedValueOnce(folderPreset({ folderItemId: 10, presetTypeId: 7 }));
    apiMock.getItemTypes.mockResolvedValueOnce([
      itemType({ id: 1, name: 'default', tagRules: [] }),
      itemType({ id: 7, name: 'comic', tagRules }),
    ]);

    const externalChanges = useExternalChanges(() => 'C:/Library');

    await externalChanges.refresh();
    await externalChanges.fixAll();

    expect(apiMock.quickImportItem).toHaveBeenCalledWith('C:/Library/new.zip');
    expect(apiMock.getFolderRulePreset).toHaveBeenCalledWith(10);
    expect(apiMock.getItemTypes).toHaveBeenCalledTimes(1);
    expect(apiMock.applyRulesToItem).toHaveBeenCalledWith(20, tagRules);
    expect(apiMock.setItemCategory).not.toHaveBeenCalled();
  });

  it('does not apply parent category when the parent has only the default category', async () => {
    apiMock.getItemByPath.mockResolvedValueOnce(dbItem({
      id: 10,
      path: 'C:/Library',
      name: 'Library',
      itemType: 'folder',
      category: 'default',
    }));
    apiMock.quickImportItem.mockResolvedValueOnce(dbItem({
      id: 20,
      path: 'C:/Library/new.zip',
      name: 'new.zip',
      category: 'default',
    }));
    apiMock.listDirFiles.mockResolvedValueOnce([]);
    apiMock.getItems.mockResolvedValueOnce(page([]));

    const externalChanges = useExternalChanges(() => 'C:/Library');

    await externalChanges.importOne('C:/Library/new.zip');

    expect(apiMock.quickImportItem).toHaveBeenCalledWith('C:/Library/new.zip');
    expect(apiMock.setItemCategory).not.toHaveBeenCalled();
    expect(apiMock.getItemTypes).not.toHaveBeenCalled();
    expect(apiMock.applyRulesToItem).not.toHaveBeenCalled();
  });
});
