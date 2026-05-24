import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type FileItem, type Item, type Page } from '../api';
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

  it('asks to apply parent folder category when importing one untracked item', async () => {
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

    expect(apiMock.getItemByPath).toHaveBeenCalledWith('C:/Library');
    expect(apiMock.quickImportItem).toHaveBeenCalledWith('C:/Library/new.zip');
    expect(apiMock.setItemCategory).toHaveBeenCalledWith(20, 'comic');
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
  });
});
