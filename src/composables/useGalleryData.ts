import { ref, computed } from 'vue';
import { api, type Item, type FileItem } from '../api';
import { pathKey } from '../utils/pathKey';

export type ExternalChangeKind = 'untracked' | 'missing' | 'modified';

export interface ExternalChange {
  kind: ExternalChangeKind;
  path: string;
  name: string;
  itemType: 'file' | 'folder';
  message: string;
}

const parentPathKey = (path: string): string => {
  const normalized = path.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index > 0 ? pathKey(normalized.slice(0, index)) : '';
};

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
      const pageSize = sTagIds ? TAG_PAGE_SIZE : 9999;
      
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
    if ((sTagIds?.length ?? 0) > 0) {
      externalChanges.value = [];
      return;
    }

    const fsByPath = new Map(fileItems.value.map(item => [pathKey(item.path), item]));
    const dbByPath = new Map(itemsData.value.map(item => [pathKey(item.path), item]));
    const changes: ExternalChange[] = [];

    for (const fileItem of fileItems.value) {
      const dbItem = dbByPath.get(pathKey(fileItem.path));
      if (!dbItem) {
        changes.push({
          kind: 'untracked',
          path: fileItem.path,
          name: fileItem.name,
          itemType: fileItem.isDir ? 'folder' : 'file',
          message: '檔案系統有項目，但資料庫尚未追蹤',
        });
        continue;
      }

      if (!fileItem.isDir && dbItem.itemType === 'file') {
        const fsMtime = fileItem.modifiedTime ? Math.floor(new Date(fileItem.modifiedTime).getTime() / 1000) : null;
        const sizeChanged = dbItem.fileSize !== null && fileItem.fileSize !== null && dbItem.fileSize !== fileItem.fileSize;
        const mtimeChanged = dbItem.fileModifiedAt !== null && fsMtime !== null && Math.abs(dbItem.fileModifiedAt - fsMtime) > 90;
        if (sizeChanged || mtimeChanged) {
          changes.push({
            kind: 'modified',
            path: fileItem.path,
            name: fileItem.name,
            itemType: 'file',
            message: '磁碟上的大小或修改時間和資料庫紀錄不同',
          });
        }
      }
    }

    const currentPathKey = pathKey(sourcePath() ?? '');
    const currentDirDbItems = itemsData.value.filter(item => parentPathKey(item.path) === currentPathKey);
    for (const dbItem of currentDirDbItems) {
      if (!fsByPath.has(pathKey(dbItem.path))) {
        changes.push({
          kind: 'missing',
          path: dbItem.path,
          name: dbItem.name,
          itemType: dbItem.itemType,
          message: '資料庫有紀錄，但目前目錄中找不到項目',
        });
      }
    }

    externalChanges.value = changes;
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
