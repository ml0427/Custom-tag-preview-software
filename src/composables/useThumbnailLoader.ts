import { ref } from 'vue';
import { api, type Item, type FileItem } from '../api';
import { useItemTypes } from './useItemTypes';
import { pathKey } from '../utils/pathKey';

const ARCHIVE_EXTS = new Set(['zip', 'cbz', 'cbr', 'rar', '7z']);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
const VIDEO_EXTS = new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv']);
const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'ogg']);

export function useThumbnailLoader() {
  const { getTypeConfig, getTypeByExtension } = useItemTypes();
  const failedImages = ref(new Set<string>());

  const onImgError = (path: string) => {
    failedImages.value = new Set(failedImages.value).add(path);
  };

  const getDbItem = (item: FileItem, itemByPath: Map<string, Item>): Item | null => {
    return itemByPath.get(pathKey(item.path)) ?? null;
  };

  /** 暴力掃描 itemByPath，用 item.name 比對（不靠 pathKey）。
   *  解決日文/特殊字元路徑導致 key 配對失敗的問題。 */
  const getDbItemFallback = (item: FileItem, itemByPath: Map<string, Item>): Item | null => {
    const name = item.name.toLowerCase();
    for (const dbItem of itemByPath.values()) {
      if (dbItem.name.toLowerCase() === name) return dbItem;
    }
    return null;
  };

  const hasCategoryAssigned = (item: FileItem, itemByPath: Map<string, Item>): boolean => {
    const dbItem = getDbItem(item, itemByPath);
    return !!dbItem?.category && dbItem.category !== 'default';
  };

  const buildThumbCacheUrl = (dbItem: Item): string => {
    const cacheVersion = encodeURIComponent([
      dbItem.coverCachePath ?? '',
      dbItem.fileModifiedAt ?? '',
      dbItem.path,
    ].join('|'));
    return `comic-cache://localhost/${dbItem.id}.jpg?v=${cacheVersion}`;
  };

  const loadThumbUrl = async (item: FileItem, itemByPath: Map<string, Item>): Promise<string> => {
    if (item.isDir) return '';
    let dbItem = getDbItem(item, itemByPath);

    if (!dbItem?.id) {
      dbItem = getDbItemFallback(item, itemByPath);
      if (!dbItem?.id) {
        console.warn(
          '[useThumbnailLoader] 找不到 DB 記錄，fallback 到路徑載入：',
          item.path,
          'itemByPath 數量:', itemByPath.size,
        );
      }
    }

    if (dbItem?.id) {
      if (dbItem.coverCachePath) {
        try {
          await api.ensureThumbCache(dbItem.id);
          return buildThumbCacheUrl(dbItem);
        } catch {
          // cache 重建失敗，fallback 到 base64
        }
      }
      return await api.getCoverBase64(dbItem.id).catch(() => '');
    }

    // 非 DB item（剛發現、尚未掃描）
    const ext = item.extension?.toLowerCase() ?? '';
    if (ARCHIVE_EXTS.has(ext)) return await api.getZipCoverByPath(item.path).catch(() => '');
    if (IMAGE_EXTS.has(ext)) return await api.getImageBase64ByPath(item.path).catch(() => '');
    return '';
  };

  const hasUserCategory = (dbItem: Item | null): boolean =>
    !!dbItem?.category && dbItem.category !== 'default';

  const getIcon = (item: FileItem, itemByPath: Map<string, Item>): string => {
    const dbItem = getDbItem(item, itemByPath);
    if (item.isDir) {
      return getTypeConfig(dbItem?.category).icon;
    }
    if (hasUserCategory(dbItem)) {
      return getTypeConfig(dbItem!.category).icon;
    }
    const ext = item.extension?.toLowerCase() ?? '';
    const matched = getTypeByExtension(ext);
    if (matched) return matched.icon;
    if (IMAGE_EXTS.has(ext)) return '🖼️';
    if (VIDEO_EXTS.has(ext)) return '🎬';
    if (ext === 'pdf') return '📄';
    if (AUDIO_EXTS.has(ext)) return '🎵';
    if (ext === 'exe') return '⚙️';
    if (['txt', 'md'].includes(ext)) return '📝';
    return '📄';
  };

  const getItemType = (item: FileItem, itemByPath: Map<string, Item>): string => {
    const dbItem = getDbItem(item, itemByPath);
    if (item.isDir) {
      if (dbItem) return getTypeConfig(dbItem.category).displayName;
      return '目錄';
    }
    if (hasUserCategory(dbItem)) {
      return getTypeConfig(dbItem!.category).displayName;
    }
    return item.extension?.toUpperCase() ?? '—';
  };

  const getTypeColor = (item: FileItem, itemByPath: Map<string, Item>): string | null => {
    const dbItem = getDbItem(item, itemByPath);
    if (item.isDir) {
      return getTypeConfig(dbItem?.category).color ?? null;
    }
    if (hasUserCategory(dbItem)) {
      return getTypeConfig(dbItem!.category).color ?? null;
    }
    return null;
  };

  return {
    onImgError,
    getDbItem,
    getDbItemFallback,
    hasCategoryAssigned,
    buildThumbCacheUrl,
    loadThumbUrl,
    getIcon,
    getItemType,
    getTypeColor,
  };
}
