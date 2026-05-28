import { type FileItem, type Item } from '../api';

export const READABLE_ARCHIVE_EXTS = new Set(['zip', 'cbz']);
export const READABLE_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

export const isReadableArchiveItem = (item: FileItem): boolean =>
  !item.isDir && READABLE_ARCHIVE_EXTS.has(item.extension?.toLowerCase() ?? '');

export const isComicFolderItem = (dbItem?: Item | null): boolean =>
  dbItem?.itemType === 'folder' && dbItem.category === 'comic';

export const isReadableFileItem = (item: FileItem, dbItem?: Item | null): boolean =>
  isReadableArchiveItem(item) || (item.isDir && isComicFolderItem(dbItem));

export const isReadableImageFile = (item: FileItem): boolean =>
  !item.isDir && READABLE_IMAGE_EXTS.has(item.extension?.toLowerCase() ?? '');
