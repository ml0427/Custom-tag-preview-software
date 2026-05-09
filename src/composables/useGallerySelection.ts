import { computed, ref, type ComputedRef } from 'vue';
import type { FileItem, Item } from '../api';
import { pathKey } from '../utils/pathKey';

export function useGallerySelection(
  filteredFileItems: ComputedRef<FileItem[]>,
  itemByPath: ComputedRef<Map<string, Item>>
) {
  const selectedFileItemPath = ref<string | null>(null);
  const selectedPaths = ref<string[]>([]);
  const lastClickIdx = ref(-1);

  const selectedItem = computed<Item | null>(() => {
    if (!selectedFileItemPath.value) return null;
    return itemByPath.value.get(pathKey(selectedFileItemPath.value)) ?? null;
  });

  const selectedItemsData = computed(() =>
    selectedPaths.value.flatMap(path => {
      const item = itemByPath.value.get(pathKey(path));
      return item ? [item] : [];
    })
  );

  const handleFileItemClick = (item: FileItem, event?: MouseEvent) => {
    const list = filteredFileItems.value;
    const idx = list.findIndex(i => i.path === item.path);

    if (event?.ctrlKey || event?.metaKey) {
      const newSet = new Set(selectedPaths.value);
      if (newSet.has(item.path)) newSet.delete(item.path);
      else {
        newSet.add(item.path);
        lastClickIdx.value = idx;
      }
      selectedPaths.value = [...newSet];
    } else if (event?.shiftKey && lastClickIdx.value >= 0) {
      const start = Math.min(lastClickIdx.value, idx);
      const end = Math.max(lastClickIdx.value, idx);
      const newSet = new Set(selectedPaths.value);
      for (let i = start; i <= end; i++) newSet.add(list[i].path);
      selectedPaths.value = [...newSet];
    } else {
      selectedPaths.value = [item.path];
      lastClickIdx.value = idx;
    }

    selectedFileItemPath.value = item.path;
  };

  const clearMultiSelect = () => {
    selectedPaths.value = selectedFileItemPath.value ? [selectedFileItemPath.value] : [];
  };

  const clearSelection = () => {
    selectedFileItemPath.value = null;
    selectedPaths.value = [];
    lastClickIdx.value = -1;
  };

  const removeSelectedPath = (path: string) => {
    if (selectedFileItemPath.value === path) selectedFileItemPath.value = null;
    selectedPaths.value = selectedPaths.value.filter(selectedPath => selectedPath !== path);
  };

  const selectPath = (path: string) => {
    selectedFileItemPath.value = path;
  };

  return {
    selectedFileItemPath,
    selectedPaths,
    selectedItem,
    selectedItemsData,
    handleFileItemClick,
    clearMultiSelect,
    clearSelection,
    removeSelectedPath,
    selectPath,
  };
}
