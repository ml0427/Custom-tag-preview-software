import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { api, type FileItem, type Item, type Page } from '../api';
import { useGalleryData } from './useGalleryData';

vi.mock('../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      listDirFiles: vi.fn(),
      getItems: vi.fn(),
    },
  };
});

const apiMock = vi.mocked(api);

const page = <T>(content: T[]): Page<T> => ({
  content,
  totalPages: 1,
  totalElements: content.length,
  number: 0,
  size: content.length,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const file = (name: string, fileSize: number, modifiedTime: string): FileItem => ({
  name,
  path: `C:/Library/${name}`,
  isDir: false,
  fileSize,
  modifiedTime,
  extension: 'zip',
});

const item = (overrides: Partial<Item>): Item => ({
  id: 1,
  path: 'C:/Library/book.zip',
  itemType: 'file',
  name: 'book',
  fileSize: 100,
  fileModifiedAt: Math.floor(new Date(2026, 4, 21, 23, 0).getTime() / 1000),
  coverCachePath: null,
  fingerprint: null,
  note: null,
  category: 'default',
  existsOnDisk: true,
  missingSince: null,
  lastSeenAt: '2026-05-21T15:00:00Z',
  openCount: 0,
  importAt: '2026-05-21T15:00:00Z',
  tags: [],
  ...overrides,
});

describe('useGalleryData', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads filesystem and database items, then sorts the visible list', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([
      file('B.zip', 20, '2026-05-21 09:00'),
      file('A.zip', 10, '2026-05-21 10:00'),
    ]);
    apiMock.getItems.mockResolvedValue(page([]));

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => undefined,
      () => '',
      () => 'name',
      () => 'asc',
    );

    await gallery.loadAll();
    await nextTick();

    expect(apiMock.listDirFiles).toHaveBeenCalledWith('C:/Library');
    expect(gallery.filteredFileItems.value.map(item => item.name)).toEqual(['A.zip', 'B.zip']);
  });

  it('uses tagged database items as the visible list when tags are selected', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([
      file('untagged.zip', 20, '2026-05-21 09:00'),
    ]);
    apiMock.getItems.mockResolvedValueOnce(page([
      item({
        path: 'C:/Library/tagged.zip',
        name: 'tagged',
        fileSize: 30,
        tags: [{ id: 7, name: 'tagged', color: null }],
      }),
    ]));

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => 7,
      () => 'tag',
      () => 'name',
      () => 'asc',
    );

    await gallery.loadAll();
    await nextTick();

    expect(gallery.filteredFileItems.value).toMatchObject([
      {
        name: 'tagged',
        path: 'C:/Library/tagged.zip',
        isDir: false,
      },
    ]);
  });

  it('keeps the backend order for a tagged page', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([]);
    apiMock.getItems.mockResolvedValueOnce(page([
      item({ id: 1, name: 'z-last' }),
      item({ id: 2, name: 'a-first' }),
    ]));

    const gallery = useGalleryData(
      () => null,
      () => 7,
      () => '',
      () => 'name',
      () => 'asc',
    );

    await gallery.loadAll();

    expect(gallery.filteredFileItems.value.map(value => value.name)).toEqual(['z-last', 'a-first']);
  });

  it('uses the full source item cache for path lookups in filesystem mode', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([
      file('first.zip', 20, '2026-05-21 09:00'),
      file('later.zip', 30, '2026-05-21 10:00'),
    ]);
    apiMock.getItems
      .mockResolvedValueOnce(page([
        item({ path: 'C:/Library/first.zip', name: 'first', fileSize: 20 }),
      ]))
      .mockResolvedValueOnce({
        ...page([
          item({
            id: 2,
            path: 'C:/Library/later.zip',
            name: 'later',
            fileSize: 30,
            tags: [{ id: 9, name: 'later-tag', color: null }],
          }),
        ]),
        totalPages: 1,
      });

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => undefined,
      () => '',
      () => 'name',
      () => 'asc',
    );

    await gallery.loadAll();
    await nextTick();

    expect(gallery.itemByPath.value.get('c:\\library\\later.zip')?.tags).toMatchObject([
      { id: 9, name: 'later-tag' },
    ]);
  });

  it('filters frequent mode to opened items and sorts by open count descending', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([
      file('never.zip', 20, '2026-05-21 09:00'),
      file('often.zip', 20, '2026-05-21 09:00'),
      file('sometimes.zip', 20, '2026-05-21 09:00'),
    ]);
    apiMock.getItems
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([
        item({ id: 1, path: 'C:/Library/never.zip', name: 'never', openCount: 0 }),
        item({ id: 2, path: 'C:/Library/often.zip', name: 'often', openCount: 7 }),
        item({ id: 3, path: 'C:/Library/sometimes.zip', name: 'sometimes', openCount: 2 }),
      ]));

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => undefined,
      () => '',
      () => 'name',
      () => 'asc',
      () => true,
    );

    await gallery.loadAll();
    await nextTick();

    expect(gallery.filteredFileItems.value.map(item => item.name)).toEqual(['often.zip', 'sometimes.zip']);
  });

  it('applies search inside frequent mode results', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([
      file('Alpha.zip', 20, '2026-05-21 09:00'),
      file('Beta.zip', 20, '2026-05-21 09:00'),
    ]);
    apiMock.getItems
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([
        item({ id: 1, path: 'C:/Library/Alpha.zip', name: 'Alpha', openCount: 3 }),
        item({ id: 2, path: 'C:/Library/Beta.zip', name: 'Beta', openCount: 5 }),
      ]));

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => undefined,
      () => 'alpha',
      () => 'name',
      () => 'asc',
      () => true,
    );

    await gallery.loadAll();
    await nextTick();

    expect(gallery.filteredFileItems.value.map(item => item.name)).toEqual(['Alpha.zip']);
  });

  it('formats tagged view file mtimes with local time instead of UTC', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([]);
    apiMock.getItems.mockResolvedValueOnce(page([
      item({
        path: 'C:/Library/night.zip',
        name: 'night',
        fileModifiedAt: Math.floor(new Date(2026, 4, 21, 23, 0).getTime() / 1000),
        tags: [{ id: 7, name: 'tagged', color: null }],
      }),
    ]));

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => 7,
      () => '',
      () => 'date',
      () => 'asc',
    );

    await gallery.loadAll();
    await nextTick();

    expect(gallery.filteredFileItems.value[0].modifiedTime).toBe('2026-05-21 23:00');
  });

  it('loads source DB cache pages concurrently after the first page', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([]);
    apiMock.getItems
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce({
        ...page([item({ id: 1, path: 'C:/Library/one.zip' })]),
        totalPages: 3,
      })
      .mockResolvedValueOnce(page([item({ id: 2, path: 'C:/Library/two.zip' })]))
      .mockResolvedValueOnce(page([item({ id: 3, path: 'C:/Library/three.zip' })]));

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => undefined,
      () => '',
      () => 'name',
      () => 'asc',
    );

    await gallery.loadAll();
    await nextTick();

    expect(apiMock.getItems).toHaveBeenNthCalledWith(3, 1, 1000, undefined, 'importAt', 'desc', 'C:/Library', undefined, true);
    expect(apiMock.getItems).toHaveBeenNthCalledWith(4, 2, 1000, undefined, 'importAt', 'desc', 'C:/Library', undefined, true);
    expect(gallery.itemByPath.value.get('c:\\library\\three.zip')?.id).toBe(3);
  });

  it('does not publish stale external changes from an older overlapping load', async () => {
    const firstFiles = deferred<FileItem[]>();
    const firstExternalItems = deferred<Page<Item>>();
    const secondFiles = deferred<FileItem[]>();
    const secondExternalItems = deferred<Page<Item>>();

    apiMock.listDirFiles
      .mockReturnValueOnce(firstFiles.promise)
      .mockReturnValueOnce(secondFiles.promise);
    apiMock.getItems
      .mockResolvedValueOnce(page([]))
      .mockReturnValueOnce(firstExternalItems.promise)
      .mockResolvedValueOnce(page([]))
      .mockReturnValueOnce(secondExternalItems.promise);

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => undefined,
      () => '',
      () => 'name',
      () => 'asc',
    );

    const firstLoad = gallery.loadAll();
    const secondLoad = gallery.loadAll();

    firstFiles.resolve([file('ghost.zip', 20, '2026-05-21 09:00')]);
    firstExternalItems.resolve(page([]));
    await firstLoad;
    await nextTick();

    expect(gallery.externalChangesReady.value).toBe(false);
    expect(gallery.externalChanges.value).toEqual([]);

    secondFiles.resolve([file('book.zip', 100, '2026-05-21 23:00')]);
    secondExternalItems.resolve(page([
      item({ path: 'C:/Library/book.zip', name: 'book', fileSize: 100 }),
    ]));
    await secondLoad;
    await nextTick();

    expect(gallery.externalChangesReady.value).toBe(true);
    expect(gallery.externalChanges.value).toEqual([]);
    expect(gallery.filteredFileItems.value.map(item => item.name)).toEqual(['book.zip']);
  });

  it('does not let an older tag page overwrite a newer page request', async () => {
    const firstPage = deferred<Page<Item>>();
    const secondPage = deferred<Page<Item>>();
    apiMock.getItems.mockImplementation(async (pageNumber = 0) => (
      pageNumber === 1 ? firstPage.promise : secondPage.promise
    ));

    const gallery = useGalleryData(
      () => null,
      () => 7,
      () => '',
      () => 'name',
      () => 'asc',
    );

    const firstLoad = gallery.gotoTagPage(1);
    const secondLoad = gallery.gotoTagPage(2);
    firstPage.resolve(page([item({ id: 1, name: 'old' })]));
    await firstLoad;
    expect(gallery.itemsData.value).toEqual([]);

    secondPage.resolve(page([item({ id: 2, name: 'new' })]));
    await secondLoad;
    expect(gallery.itemsData.value.map(value => value.name)).toEqual(['new']);
    expect(gallery.isLoading.value).toBe(false);
  });

  it('exposes directory failures without manufacturing missing entries', async () => {
    apiMock.listDirFiles.mockRejectedValueOnce(new Error('permission denied'));
    apiMock.getItems.mockResolvedValue(page([
      item({ path: 'C:/Library/missing.zip', name: 'missing' }),
    ]));

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => undefined,
      () => '',
      () => 'name',
      () => 'asc',
    );

    await gallery.loadAll();

    expect(gallery.loadError.value).toBe('無法讀取目錄：permission denied');
    expect(gallery.externalChanges.value).toEqual([]);
    expect(gallery.externalChangesReady.value).toBe(false);
  });

  it('searches filesystem entries through database names, tags, and notes', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([file('placeholder.zip', 20, '2026-05-21 09:00')]);
    apiMock.getItems
      .mockResolvedValueOnce(page([item({
        path: 'C:/Library/placeholder.zip',
        name: 'archived-name',
        note: 'needle in note',
        tags: [{ id: 8, name: 'topic-tag', color: null }],
      })]))
      .mockResolvedValueOnce(page([]));

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => undefined,
      () => 'needle',
      () => 'name',
      () => 'asc',
    );

    await gallery.loadAll();

    expect(gallery.filteredFileItems.value.map(value => value.name)).toEqual(['placeholder.zip']);
  });

  it('sends tag search and ordering to the backend before pagination', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([]);
    apiMock.getItems.mockResolvedValueOnce({
      ...page([item({ id: 3, name: 'unmatched-name', note: 'needle note', fileSize: 42 })]),
      totalPages: 3,
    });

    const gallery = useGalleryData(
      () => null,
      () => 7,
      () => 'needle',
      () => 'size',
      () => 'desc',
    );

    await gallery.loadAll();

    expect(apiMock.getItems).toHaveBeenCalledWith(
      0,
      200,
      [7],
      'fileSize',
      'desc',
      undefined,
      undefined,
      false,
      'needle',
      undefined,
    );
    expect(gallery.filteredFileItems.value.map(value => value.name)).toEqual(['unmatched-name']);
    expect(gallery.tagTotalPages.value).toBe(3);
  });

  it('asks the backend for descending open-count order in frequent tag mode', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([]);
    apiMock.getItems.mockResolvedValueOnce(page([item({ id: 4, openCount: 2 })]));

    const gallery = useGalleryData(
      () => null,
      () => 7,
      () => '',
      () => 'name',
      () => 'asc',
      () => true,
    );

    await gallery.loadAll();

    expect(apiMock.getItems).toHaveBeenCalledWith(
      0,
      200,
      [7],
      'openCount',
      'desc',
      undefined,
      undefined,
      false,
      undefined,
      true,
    );
  });

  it('publishes the first external page before bounded background completion', async () => {
    const backgroundPage = deferred<Page<Item>>();
    apiMock.listDirFiles.mockResolvedValueOnce([file('first.zip', 20, '2026-05-21 09:00')]);
    apiMock.getItems.mockImplementation(async (pageNumber = 0, _size, _tags, _sortBy, _sortDir, _source, _itemType, includeMissing) => {
      if (includeMissing) {
        if (pageNumber === 0) return { ...page([]), totalPages: 2 };
        return backgroundPage.promise;
      }
      return page([]);
    });

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => undefined,
      () => '',
      () => 'name',
      () => 'asc',
    );

    await gallery.loadAll();
    expect(gallery.isLoading.value).toBe(false);
    expect(gallery.externalChangesReady.value).toBe(false);
    expect(apiMock.getItems).toHaveBeenCalledWith(1, 1000, undefined, 'importAt', 'desc', 'C:/Library', undefined, true);

    backgroundPage.resolve(page([item({ id: 9, path: 'C:/Library/later.zip', name: 'later' })]));
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();
    expect(gallery.itemByPath.value.get('c:\\library\\later.zip')?.id).toBe(9);
    expect(gallery.externalChangesReady.value).toBe(true);
  });

  it('surfaces a database page failure instead of treating it as an empty result', async () => {
    apiMock.listDirFiles.mockResolvedValueOnce([]);
    apiMock.getItems.mockRejectedValue(new Error('database unavailable'));

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => undefined,
      () => '',
      () => 'name',
      () => 'asc',
    );

    await gallery.loadAll();

    expect(gallery.loadError.value).toBe('database unavailable');
    expect(gallery.externalChangesReady.value).toBe(false);
  });

  it('surfaces an external background failure and keeps changes unready', async () => {
    const backgroundPage = deferred<Page<Item>>();
    apiMock.listDirFiles.mockResolvedValueOnce([]);
    apiMock.getItems.mockImplementation(async (pageNumber = 0, _size, _tags, _sortBy, _sortDir, _source, _itemType, includeMissing) => {
      if (includeMissing) {
        if (pageNumber === 0) return { ...page([]), totalPages: 2 };
        return backgroundPage.promise;
      }
      return page([]);
    });

    const gallery = useGalleryData(
      () => 'C:/Library',
      () => undefined,
      () => '',
      () => 'name',
      () => 'asc',
    );

    await gallery.loadAll();
    expect(gallery.externalChangesReady.value).toBe(false);

    backgroundPage.reject(new Error('external page unavailable'));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(gallery.loadError.value).toBe('外部變更載入失敗：external page unavailable');
    expect(gallery.externalChangesReady.value).toBe(false);
  });
});
