import type { Item } from '../api';

export interface PreviewEditCapabilities {
  canEditName: boolean;
  canEditTags: boolean;
  canEditNote: boolean;
  canEditCategory: boolean;
  canEditFolderRules: boolean;
  canEditCoverImages: boolean;
}

export function getPreviewEditCapabilities(item: Item): PreviewEditCapabilities {
  const isFolder = item.itemType === 'folder';
  return {
    canEditName: true,
    canEditTags: true,
    canEditNote: isFolder,
    canEditCategory: !isFolder,
    canEditFolderRules: isFolder,
    canEditCoverImages: !isFolder,
  };
}
