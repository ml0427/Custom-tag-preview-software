import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type DuplicateGroup, type DuplicateItem } from '../api';
import { useDuplicateScanner } from './useDuplicateScanner';

const toast = vi.hoisted(() => ({ show: vi.fn(), confirm: vi.fn() }));

vi.mock('./useToast', () => ({ useToast: () => toast }));
vi.mock('../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getDuplicateGroups: vi.fn(),
      trashItem: vi.fn(),
      trashVerifiedDuplicates: vi.fn(),
    },
  };
});

const apiMock = vi.mocked(api);

const duplicateItem = (overrides: Partial<DuplicateItem>): DuplicateItem => ({
  id: 1,
  path: 'C:/Library/book.zip',
  itemType: 'file',
  name: 'book.zip',
  fileSize: 1024,
  fileModifiedAt: 1_700_000_000,
  coverCachePath: null,
  fingerprint: 'sha256:duplicate',
  note: null,
  category: 'default',
  existsOnDisk: true,
  missingSince: null,
  lastSeenAt: null,
  openCount: 0,
  importAt: '2026-06-17T00:00:00Z',
  tags: [],
  pathExists: true,
  ...overrides,
});

const duplicateGroup = (items: DuplicateItem[]): DuplicateGroup => ({
  fingerprint: 'sha256:duplicate',
  status: 'duplicate',
  items,
});

describe('useDuplicateScanner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiMock.getDuplicateGroups.mockResolvedValue([]);
    apiMock.trashVerifiedDuplicates.mockResolvedValue(undefined);
    toast.confirm.mockResolvedValue(true);
  });

  it('keeps the newest existing file and batches the older files for verified trash', async () => {
    const newest = duplicateItem({ id: 30, path: 'C:/Library/new.zip', name: 'new.zip', fileModifiedAt: 1_800_000_000 });
    const older = duplicateItem({ id: 10, path: 'C:/Library/old.zip', name: 'old.zip', fileModifiedAt: 1_600_000_000 });
    const middle = duplicateItem({ id: 20, path: 'C:/Library/middle.zip', name: 'middle.zip', fileModifiedAt: 1_700_000_000 });
    const missing = duplicateItem({ id: 40, path: 'C:/Library/missing.zip', pathExists: false, fileModifiedAt: 1_900_000_000 });
    const scanner = useDuplicateScanner();
    scanner.groups.value = [duplicateGroup([newest, missing, older, middle])];

    await scanner.keepNewestInGroup(0);

    expect(apiMock.trashVerifiedDuplicates).toHaveBeenCalledWith(
      newest.path,
      [older.path, middle.path],
    );
    expect(apiMock.trashItem).not.toHaveBeenCalled();
    expect(apiMock.getDuplicateGroups).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith('已刪除 2 個重複項目', 'success');
  });

  it('refreshes groups and reports that batch removal was incomplete on failure', async () => {
    const newest = duplicateItem({ id: 30, path: 'C:/Library/new.zip', fileModifiedAt: 1_800_000_000 });
    const older = duplicateItem({ id: 10, path: 'C:/Library/old.zip', fileModifiedAt: 1_600_000_000 });
    const scanner = useDuplicateScanner();
    scanner.groups.value = [duplicateGroup([older, newest])];
    apiMock.trashVerifiedDuplicates.mockRejectedValue(new Error('permission denied'));

    await scanner.keepNewestInGroup(0);

    expect(apiMock.trashVerifiedDuplicates).toHaveBeenCalledWith(newest.path, [older.path]);
    expect(apiMock.getDuplicateGroups).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith(
      '批次移除未全部完成：Error: permission denied',
      'error',
    );
  });
});
