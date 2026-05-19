import { ref, computed } from 'vue';
import { api, type Item, type FileItem } from '../api';
import { pathKey } from '../utils/pathKey';
import { computeExternalChanges, type ExternalChange } from './useExternalChanges';

export type { ExternalChange, ExternalChangeKind } from './useExternalChanges';

export function useGalleryData(
  sourcePath: () => string | null,
  selectedTagIds: () => number[] | undefined,
  gallerySearch: () => string,
  sortBy: () => 'name' | 'size' | 'date',
  sortDir: () => 'asc' | 'desc'
) {
  const itemsData = ref<Item[]>([]);
  const fileItems = ref<FileItem[]>([]);
  const isLoading = ref(false);
  const externalChanges = ref<ExternalChange[]>([]);
  const tagPage = ref(0);
  const tagTotalPages = ref(1);
  const TAG_PAGE_SIZE = 200;

  const itemByPath = computed(() => {
    return new Map(itemsData.value.map(i => [pathKey(i.path), i]));
  });

  const filteredFileItems = computed(() => {
    const sTagIds = selectedTagIds();
    const base: FileItem[] = (sTagIds?.length ?? 0) > 0
      ? itemsData.value.map(item => {
        const ext = item.itemType === 'folder' ? '' : item.path.split('.').pop() || '';
        const mtime = item.fileModifiedAt
          ? new Date(item.fileModifiedAt * 1000).toISOString().replace('T', ' ').slice(0, 16)
          : '';
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

  const loadFileItems = async () => {
    const path = sourcePath();
    if (!path) { fileItems.value = []; return; }
    try {
      fileItems.value = await api.listDirFiles(path);
    } catch {
      fileItems.value = [];
    }
  };

  const loadItemsBackground = async (page = 0) => {
    try {
      const sPath = sourcePath();
      const tagIds = selectedTagIds();
      const sTagIds = tagIds?.length ? tagIds : undefined;
      const pageSize = TAG_PAGE_SIZE;
      
      const res = await api.getItems(page, pageSize, sTagIds, 'importAt', 'desc', sTagIds ? undefined : (sPath ?? undefined));
      itemsData.value = res.content;

      tagPage.value = page;
      tagTotalPages.value = Math.max(1, res.totalPages);
    } catch (e) {
      console.error('❌ [useGalleryData] API getItems error:', e);
      itemsData.value = [];
    }
  };

  const detectExternalChanges = () => {
    const sTagIds = selectedTagIds();
    const path = sourcePath();
    if ((sTagIds?.length ?? 0) > 0 || !path) {
      externalChanges.value = [];
      return;
    }
    externalChanges.value = computeExternalChanges(path, fileItems.value, itemsData.value);
  };

  const loadAll = async () => {
    isLoading.value = true;
    // 不在開始時清空資料，避免 computed selectedItem 瞬間變 null 造成預覽閃爍
    // 直接用新資料覆蓋舊資料
    try {
      await Promise.all([loadFileItems(), loadItemsBackground()]);
      detectExternalChanges();
    } catch (e) {
      console.error('Gallery load error:', e);
    } finally {
      isLoading.value = false;
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
    tagPage,
    tagTotalPages,
    itemByPath,
    filteredFileItems,
    loadAll,
    gotoTagPage,
  };
}
