import type { Ref } from 'vue';
import type { FileItem, Item } from '../api';
import { pathKey } from '../utils/pathKey';

export function useGalleryDetails(options: {
  itemByPath: Readonly<Ref<Map<string, Item>>>;
  previewTab: Ref<'info' | 'edit'>;
  isPreviewOpen: Ref<boolean>;
  selectItem: (item: FileItem) => void;
  importItem: (path: string) => Promise<Item>;
  reloadItems: () => Promise<unknown>;
  onError: (error: unknown) => void;
}) {
  const openDetails = async (item: FileItem) => {
    options.selectItem(item);
    options.previewTab.value = 'info';
    options.isPreviewOpen.value = true;
    if (options.itemByPath.value.has(pathKey(item.path))) return;

    try {
      await options.importItem(item.path);
      await options.reloadItems();
      // Selection and visibility may have changed while importing; leave them alone.
    } catch (error) {
      options.onError(error);
    }
  };

  return { openDetails };
}
