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

export function useGalleryData(
  sourcePath: () => string | null,
  selectedTagId: () => number | null | undefined,
  gallerySearch: () => string,
  sortBy: () => 'name' | 'size' | 'date',
  sortDir: () => 'asc' | 'desc',
  frequentMode: () => boolean = () => false,
) {
  const itemsData = ref<Item[]>([]);
  const externalChangeItemsData = ref<Item[]>([]);
  const fileItems = ref<FileItem[]>([]);
  const isLoading = ref(false);
  const externalChanges = ref<ExternalChange[]>([]);
  const externalChangesReady = ref(false);
  const tagPage = ref(0);
  const tagTotalPages = ref(1);
  const TAG_PAGE_SIZE = 200;
  const EXTERNAL_CHANGE_PAGE_SIZE = 1000;
  let loadAllToken = 0;

  interface ItemPageResult {
    content: Item[];
    page: number;
    totalPages: number;
  }

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

    let items = [...base];
    const q = gallerySearch().trim().toLowerCase();
    if (q) items = items.filter(i => i.name.toLowerCase().includes(q));

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

    // 排序邏輯也應該在這裡執行，確保 grid view 也是排序過的
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

  const fetchFileItems = async (path: string | null): Promise<FileItem[]> => {
    if (!path) return [];
    try {
      return await api.listDirFiles(path);
    } catch {
      return [];
    }
  };

  const fetchItemsPage = async (
    page = 0,
    path: string | null = sourcePath(),
    tagId: number | null | undefined = selectedTagId(),
  ): Promise<ItemPageResult> => {
    try {
      const sTagIds = tagId != null ? [tagId] : undefined;
      const pageSize = TAG_PAGE_SIZE;
      const res = await api.getItems(page, pageSize, sTagIds, 'importAt', 'desc', sTagIds ? undefined : (path ?? undefined));
      return {
        content: res.content,
        page,
        totalPages: Math.max(1, res.totalPages),
      };
    } catch (e) {
      console.error('❌ [useGalleryData] API getItems error:', e);
      return {
        content: [],
        page,
        totalPages: 1,
      };
    }
  };

  const publishItemsPage = (result: ItemPageResult) => {
    itemsData.value = result.content;
    tagPage.value = result.page;
    tagTotalPages.value = result.totalPages;
  };

  const loadItemsBackground = async (page = 0) => {
    publishItemsPage(await fetchItemsPage(page));
  };

  const fetchExternalChangeItems = async (
    path: string | null,
    tagId: number | null | undefined,
  ): Promise<Item[]> => {
    if (tagId != null || !path) return [];

    const firstPage = await api.getItems(0, EXTERNAL_CHANGE_PAGE_SIZE, undefined, 'importAt', 'desc', path, undefined, true);
    const allItems = [...firstPage.content];
    if (firstPage.totalPages > 1) {
      const pages = Array.from({ length: firstPage.totalPages - 1 }, (_, index) => index + 1);
      const nextPages = await Promise.all(
        pages.map(page => api.getItems(page, EXTERNAL_CHANGE_PAGE_SIZE, undefined, 'importAt', 'desc', path, undefined, true))
      );
      allItems.push(...nextPages.flatMap(page => page.content));
    }
    return allItems;
  };

  const detectExternalChanges = (
    path: string | null = sourcePath(),
    tagId: number | null | undefined = selectedTagId(),
  ) => {
    if (tagId != null || !path) {
      externalChanges.value = [];
      externalChangesReady.value = true;
      return;
    }
    externalChanges.value = computeExternalChanges(path, fileItems.value, externalChangeItemsData.value);
    externalChangesReady.value = true;
  };

  const loadAll = async () => {
    const token = ++loadAllToken;
    const path = sourcePath();
    const tagId = selectedTagId();
    isLoading.value = true;
    externalChangesReady.value = false;
    externalChanges.value = [];
    // 不在開始時清空資料，避免 computed selectedItem 瞬間變 null 造成預覽閃爍
    // 直接用新資料覆蓋舊資料
    try {
      const [nextFileItems, nextItemsPage, nextExternalItems] = await Promise.all([
        fetchFileItems(path),
        fetchItemsPage(0, path, tagId),
        fetchExternalChangeItems(path, tagId),
      ]);
      if (token !== loadAllToken) return;
      fileItems.value = nextFileItems;
      publishItemsPage(nextItemsPage);
      externalChangeItemsData.value = nextExternalItems;
      detectExternalChanges(path, tagId);
    } catch (e) {
      if (token === loadAllToken) console.error('Gallery load error:', e);
    } finally {
      if (token === loadAllToken) isLoading.value = false;
    }
  };


  const gotoTagPage = async (page: number) => {
    isLoading.value = true;
    try { await loadItemsBackground(page); }
    catch (e) { console.error(e); }
    finally { isLoading.value = false; }
  };

  // Watchers moved to ItemGallery for better control over related states (like selected items)

  return {
    itemsData,
    fileItems,
    isLoading,
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
