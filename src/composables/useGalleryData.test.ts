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
  importAt: '2026-05-21T15:00:00Z',
  tags: [],
  ...overrides,
});

describe('useGalleryData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      () => [7],
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
      () => [7],
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

    expect(apiMock.getItems).toHaveBeenNthCalledWith(3, 1, 1000, undefined, 'importAt', 'desc', 'C:/Library');
    expect(apiMock.getItems).toHaveBeenNthCalledWith(4, 2, 1000, undefined, 'importAt', 'desc', 'C:/Library');
    expect(gallery.itemByPath.value.get('c:\\library\\three.zip')?.id).toBe(3);
  });
});
