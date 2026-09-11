import { ref, computed } from 'vue';
import { api, type Item, type FileItem } from '../api';
import { pathKey } from '../utils/pathKey';
import { computeExternalChanges, type ExternalChange } from './useExternalChanges';

export type { ExternalChange, ExternalChangeKind } from './useExternalChanges';

const formatLocalMinute = (timestampSeconds: number): string => {
  const date = new Date(timestampSeconds * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

type GallerySortBy = 'name' | 'size' | 'date';
type GallerySortDir = 'asc' | 'desc';

interface GalleryLoadContext {
  generation: number;
  path: string | null;
  tagId: number | null | undefined;
  search: string;
  sortBy: GallerySortBy;
  sortDir: GallerySortDir;
  frequentMode: boolean;
}

interface ItemPageResult {
  content: Item[];
  page: number;
  totalPages: number;
}

interface FileItemsResult {
  content: FileItem[];
  error: unknown | null;
}

const EXTERNAL_CHANGE_CONCURRENCY = 4;

export function useGalleryData(
  sourcePath: () => string | null,
  selectedTagId: () => number | null | undefined,
  gallerySearch: () => string,
  sortBy: () => GallerySortBy,
  sortDir: () => GallerySortDir,
  frequentMode: () => boolean = () => false,
) {
  const itemsData = ref<Item[]>([]);
  const externalChangeItemsData = ref<Item[]>([]);
  const fileItems = ref<FileItem[]>([]);
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);
  const externalChanges = ref<ExternalChange[]>([]);
  const externalChangesReady = ref(false);
  const tagPage = ref(0);
  const tagTotalPages = ref(1);
  const TAG_PAGE_SIZE = 200;
  const EXTERNAL_CHANGE_PAGE_SIZE = 1000;
  let loadGeneration = 0;

  const itemByPath = computed(() => {
    const hasTagFilter = selectedTagId() != null;
    const dbItems = hasTagFilter ? itemsData.value : [...itemsData.value, ...externalChangeItemsData.value];
    return new Map(dbItems.map(i => [pathKey(i.path), i]));
  });

  const filteredFileItems = computed(() => {
    const sTagId = selectedTagId();
    const base: FileItem[] = sTagId != null
      ? itemsData.value.map(item => {
        const ext = item.itemType === 'folder' ? '' : item.path.split('.').pop() || '';
        const mtime = item.fileModifiedAt ? formatLocalMinute(item.fileModifiedAt) : '';
        return {
          name: item.name,
          path: item.path,
          isDir: item.itemType === 'folder',
          fileSize: item.fileSize,
          modifiedTime: mtime,
          extension: ext,
        };
      })
      : fileItems.value;

    // The backend has already filtered and sorted the complete tag result
    // before pagination. Preserve that page order exactly.
    if (sTagId != null) return base;

    let items = [...base];
    const q = gallerySearch().trim().toLowerCase();
    if (q && sTagId == null) {
      // Filesystem mode keeps the real directory listing, but lets database
      // metadata make an otherwise unsearchable placeholder visible.
      items = items.filter(fileItem => {
        const dbItem = itemByPath.value.get(pathKey(fileItem.path));
        const searchable = [
          fileItem.name,
          dbItem?.name,
          dbItem?.note,
          ...(dbItem?.tags.map(tag => tag.name) ?? []),
        ];
        return searchable.some(value => value?.toLowerCase().includes(q));
      });
    }

    if (frequentMode()) {
      items = items
        .filter(item => (itemByPath.value.get(pathKey(item.path))?.openCount ?? 0) > 0)
        .sort((a, b) => {
          const aCount = itemByPath.value.get(pathKey(a.path))?.openCount ?? 0;
          const bCount = itemByPath.value.get(pathKey(b.path))?.openCount ?? 0;
          if (aCount !== bCount) return bCount - aCount;
          return (a.name || '').localeCompare(b.name || '', 'zh-TW', { sensitivity: 'base' });
        });
      return items;
    }

    // Filesystem mode still sorts the current directory listing locally.
    const by = sortBy();
    const dir = sortDir();
    items.sort((a, b) => {
      let cmp = 0;
      if (by === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '', 'zh-TW', { sensitivity: 'base' });
      } else if (by === 'size') {
        cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0);
      } else if (by === 'date') {
        cmp = (a.modifiedTime ?? '').localeCompare(b.modifiedTime ?? '');
      }
      return dir === 'asc' ? cmp : -cmp;
    });

    return items;
  });

  const beginLoad = (): GalleryLoadContext => {
    const context: GalleryLoadContext = {
      generation: ++loadGeneration,
      path: sourcePath(),
      tagId: selectedTagId(),
      search: gallerySearch().trim(),
      sortBy: sortBy(),
      sortDir: sortDir(),
      frequentMode: frequentMode(),
    };
    isLoading.value = true;
    loadError.value = null;
    externalChangesReady.value = false;
    externalChanges.value = [];
    return context;
  };

  const isCurrent = (context: GalleryLoadContext): boolean => context.generation === loadGeneration;

  const fetchFileItems = async (path: string | null): Promise<FileItemsResult> => {
    if (!path) return { content: [], error: null };
    try {
      return { content: await api.listDirFiles(path), error: null };
    } catch (error) {
      console.error('❌ [useGalleryData] directory read error:', error);
      return { content: [], error };
    }
  };

  const fetchItemsPage = async (
    context: GalleryLoadContext,
    page = 0,
  ): Promise<ItemPageResult> => {
    const sTagIds = context.tagId != null ? [context.tagId] : undefined;
    const serverSortBy = context.tagId != null
        ? context.frequentMode
          ? 'openCount'
          : context.sortBy === 'size'
            ? 'fileSize'
            : context.sortBy === 'date'
              ? 'fileModifiedAt'
              : 'name'
        : 'importAt';
    const res = context.tagId != null
        ? await api.getItems(
          page,
          TAG_PAGE_SIZE,
          sTagIds,
          serverSortBy,
          context.frequentMode ? 'desc' : context.sortDir,
          undefined,
          undefined,
          false,
          context.search || undefined,
          context.frequentMode ? true : undefined,
        )
        : await api.getItems(
          page,
          TAG_PAGE_SIZE,
          undefined,
          serverSortBy,
          'desc',
          context.path ?? undefined,
        );
    return {
      content: res.content,
      page,
      totalPages: Math.max(1, res.totalPages),
    };
  };

  const publishItemsPage = (result: ItemPageResult) => {
    itemsData.value = result.content;
    tagPage.value = result.page;
    tagTotalPages.value = result.totalPages;
  };

  const fetchExternalChangeItems = async (
    path: string | null,
    tagId: number | null | undefined,
  ): Promise<ItemPageResult> => {
    if (tagId != null || !path) return { content: [], page: 0, totalPages: 1 };

    const firstPage = await api.getItems(
      0,
      EXTERNAL_CHANGE_PAGE_SIZE,
      undefined,
      'importAt',
      'desc',
      path,
      undefined,
      true,
    );
    return {
      content: firstPage.content,
      page: 0,
      totalPages: Math.max(1, firstPage.totalPages),
    };
  };

  const detectExternalChanges = (
    path: string | null,
    tagId: number | null | undefined,
    directoryReadFailed = false,
  ) => {
    if (directoryReadFailed) {
      // An unreadable directory is an unknown state. Treating it as an empty
      // directory would manufacture missing entries and hide the real error.
      externalChanges.value = [];
      externalChangesReady.value = false;
      return;
    }
    if (tagId != null || !path) {
      externalChanges.value = [];
      externalChangesReady.value = true;
      return;
    }
    externalChanges.value = computeExternalChanges(path, fileItems.value, externalChangeItemsData.value);
    externalChangesReady.value = true;
  };

  const loadExternalItemsBackground = async (
    context: GalleryLoadContext,
    firstPage: ItemPageResult,
  ) => {
    if (!context.path || context.tagId != null || firstPage.totalPages <= 1) return;
    for (let start = 1; start < firstPage.totalPages; start += EXTERNAL_CHANGE_CONCURRENCY) {
      const pages = Array.from(
        { length: Math.min(EXTERNAL_CHANGE_CONCURRENCY, firstPage.totalPages - start) },
        (_, index) => start + index,
      );
      try {
        const nextPages = await Promise.all(pages.map(page => api.getItems(
          page,
          EXTERNAL_CHANGE_PAGE_SIZE,
          undefined,
          'importAt',
          'desc',
          context.path ?? undefined,
          undefined,
          true,
        )));
        if (!isCurrent(context)) return;
        externalChangeItemsData.value = [
          ...externalChangeItemsData.value,
          ...nextPages.flatMap(page => page.content),
        ];
      } catch (error) {
        if (isCurrent(context)) {
          console.error('❌ [useGalleryData] external change load error:', error);
          loadError.value = error instanceof Error ? `外部變更載入失敗：${error.message}` : `外部變更載入失敗：${String(error)}`;
          externalChanges.value = [];
          externalChangesReady.value = false;
        }
        return;
      }
    }
    if (isCurrent(context)) detectExternalChanges(context.path, context.tagId);
  };

  const loadAll = async () => {
    const context = beginLoad();
    try {
      const [nextFileItems, nextItemsPage, nextExternalItems] = await Promise.all([
        fetchFileItems(context.path),
        fetchItemsPage(context),
        fetchExternalChangeItems(context.path, context.tagId),
      ]);
      if (!isCurrent(context)) return;
      fileItems.value = nextFileItems.content;
      if (nextFileItems.error) {
        const message = nextFileItems.error instanceof Error
          ? nextFileItems.error.message
          : String(nextFileItems.error);
        loadError.value = `無法讀取目錄：${message}`;
      }
      publishItemsPage(nextItemsPage);
      externalChangeItemsData.value = nextExternalItems.content;
      if (nextFileItems.error) {
        detectExternalChanges(context.path, context.tagId, true);
      } else if (nextExternalItems.totalPages <= 1) {
        detectExternalChanges(context.path, context.tagId);
      } else {
        // Until every DB page is available, change detection would report
        // false missing or untracked entries from the partial cache.
        externalChanges.value = [];
        externalChangesReady.value = false;
      }
      isLoading.value = false;
      if (!nextFileItems.error) void loadExternalItemsBackground(context, nextExternalItems);
    } catch (error) {
      if (isCurrent(context)) {
        console.error('Gallery load error:', error);
        loadError.value = error instanceof Error ? error.message : String(error);
        externalChanges.value = [];
        externalChangesReady.value = false;
        isLoading.value = false;
      }
    }
  };

  const gotoTagPage = async (page: number) => {
    const context = beginLoad();
    try {
      const result = await fetchItemsPage(context, page);
      if (!isCurrent(context)) return;
      publishItemsPage(result);
    } catch (error) {
      if (isCurrent(context)) {
        console.error(error);
        loadError.value = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (isCurrent(context)) isLoading.value = false;
    }
  };

  return {
    itemsData,
    fileItems,
    isLoading,
    loadError,
    externalChanges,
    externalChangesReady,
    tagPage,
    tagTotalPages,
    itemByPath,
    filteredFileItems,
    loadAll,
    gotoTagPage,
  };
}
