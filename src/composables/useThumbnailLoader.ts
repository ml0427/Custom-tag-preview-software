import { ref } from 'vue';
import { type Item, type FileItem } from '../api';
import { useItemTypes } from './useItemTypes';

export function useThumbnailLoader() {
  const { getTypeConfig, getTypeByExtension } = useItemTypes();
  const failedImages = ref(new Set<string>());

  const onImgError = (path: string) => {
    failedImages.value = new Set(failedImages.value).add(path);
  };

  const getCoverUrl = (item: FileItem, itemByPath: Map<string, Item>): string | null => {
    if (item.isDir) return null;
    const dbItem = itemByPath.get(item.path);
    if (!dbItem) return null;
    return `comic-cache://localhost/${dbItem.id}.jpg`;
  };

  const showCover = (item: FileItem, itemByPath: Map<string, Item>): boolean => {
    const url = getCoverUrl(item, itemByPath);
    return !!url && !failedImages.value.has(item.path);
  };

  const getIcon = (item: FileItem, itemByPath: Map<string, Item>): string => {
    if (item.isDir) {
      const ft = itemByPath.get(item.path)?.category;
      return getTypeConfig(ft).icon;
    }
    const ext = item.extension?.toLowerCase() ?? '';
    const matched = getTypeByExtension(ext);
    if (matched) return matched.icon;
    const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    const VIDEO_EXTS = ['mp4', 'mkv', 'avi', 'mov', 'wmv'];
    if (IMAGE_EXTS.includes(ext)) return '🖼️';
    if (VIDEO_EXTS.includes(ext)) return '🎬';
    if (ext === 'pdf') return '📄';
    if (['mp3', 'flac', 'wav', 'ogg'].includes(ext)) return '🎵';
    if (ext === 'exe') return '⚙️';
    if (['txt', 'md'].includes(ext)) return '📝';
    return '📄';
  };

  const getItemType = (item: FileItem, itemByPath: Map<string, Item>): string => {
    if (item.isDir) {
      const dbItem = itemByPath.get(item.path);
      if (dbItem) return getTypeConfig(dbItem.category).displayName;
      return '目錄';
    }
    return item.extension?.toUpperCase() ?? '—';
  };

  const getTypeColor = (item: FileItem, itemByPath: Map<string, Item>): string | null => {
    if (!item.isDir) return null;
    const dbItem = itemByPath.get(item.path);
    return getTypeConfig(dbItem?.category).color ?? null;
  };

  return {
    onImgError,
    getCoverUrl,
    showCover,
    getIcon,
    getItemType,
    getTypeColor,
  };
}
