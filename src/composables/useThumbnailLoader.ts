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

  const getCoverUrl = (item: FileItem, itemByPath: Map<string, Item>): string | null => {
    if (item.isDir) return null;
    const dbItem = getDbItem(item, itemByPath);
    if (!dbItem) return null;
    return `comic-cache://localhost/${dbItem.id}.jpg`;
  };

  const showCover = (item: FileItem, itemByPath: Map<string, Item>): boolean => {
    const url = getCoverUrl(item, itemByPath);
    return !!url && !failedImages.value.has(item.path);
  };

  const getDbItem = (item: FileItem, itemByPath: Map<string, Item>): Item | null => {
    return itemByPath.get(pathKey(item.path)) ?? null;
  };

  const loadThumbUrl = async (item: FileItem, itemByPath: Map<string, Item>): Promise<string> => {
    if (item.isDir) return '';
    const dbItem = getDbItem(item, itemByPath);
    if (dbItem?.id) return await api.getCoverBase64(dbItem.id).catch(() => '');

    const ext = item.extension?.toLowerCase() ?? '';
    if (ARCHIVE_EXTS.has(ext)) return await api.getZipCoverByPath(item.path).catch(() => '');
    if (IMAGE_EXTS.has(ext)) return await api.getImageBase64ByPath(item.path).catch(() => '');
    return '';
  };

  const getIcon = (item: FileItem, itemByPath: Map<string, Item>): string => {
    if (item.isDir) {
      const ft = getDbItem(item, itemByPath)?.category;
      return getTypeConfig(ft).icon;
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
    if (item.isDir) {
      const dbItem = getDbItem(item, itemByPath);
      if (dbItem) return getTypeConfig(dbItem.category).displayName;
      return '目錄';
    }
    return item.extension?.toUpperCase() ?? '—';
  };

  const getTypeColor = (item: FileItem, itemByPath: Map<string, Item>): string | null => {
    if (!item.isDir) return null;
    const dbItem = getDbItem(item, itemByPath);
    return getTypeConfig(dbItem?.category).color ?? null;
  };

  return {
    onImgError,
    getDbItem,
    getCoverUrl,
    showCover,
    loadThumbUrl,
    getIcon,
    getItemType,
    getTypeColor,
  };
}
