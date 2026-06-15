import { type FileItem, type Item } from '../api';

export const READABLE_ARCHIVE_EXTS = new Set(['zip', 'cbz']);
export const READABLE_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

export const isReadableArchiveItem = (item: FileItem): boolean =>
  !item.isDir && READABLE_ARCHIVE_EXTS.has(item.extension?.toLowerCase() ?? '');

export const isReadableFolderItem = (dbItem?: Item | null): boolean =>
  dbItem?.itemType === 'folder';

/** @deprecated Folder readability is no longer tied to the legacy comic category. */
export const isComicFolderItem = isReadableFolderItem;

export const isReadableFileItem = (item: FileItem, dbItem?: Item | null): boolean =>
  isReadableArchiveItem(item) || (item.isDir && (!dbItem || isReadableFolderItem(dbItem)));

export const isReadableImageFile = (item: FileItem): boolean =>
  !item.isDir && READABLE_IMAGE_EXTS.has(item.extension?.toLowerCase() ?? '');
