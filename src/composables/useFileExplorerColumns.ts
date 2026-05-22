import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';

const STORAGE_KEY = 'gallery-col-visibility';
const DEFAULT_COLUMNS = ['thumb', 'tags', 'size', 'date'];

const loadStoredColumns = () => {
  const storedCols = localStorage.getItem(STORAGE_KEY);
  if (!storedCols) return DEFAULT_COLUMNS;

  try {
    const parsed = JSON.parse(storedCols);
    return Array.isArray(parsed) ? parsed : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
};

export function useFileExplorerColumns() {
  const visibleCols = reactive(new Set<string>(loadStoredColumns()));
  const colPickerOpen = ref(false);
  const colPickerRef = ref<HTMLElement | null>(null);

  const toggleCol = (col: string) => {
    if (visibleCols.has(col)) visibleCols.delete(col);
    else visibleCols.add(col);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visibleCols]));
  };

  const colCount = computed(() =>
    2 +
    (visibleCols.has('thumb') ? 1 : 0) +
    (visibleCols.has('tags') ? 1 : 0) +
    (visibleCols.has('size') ? 1 : 0) +
    (visibleCols.has('date') ? 1 : 0)
  );

  const onDocClick = (e: MouseEvent) => {
    if (colPickerOpen.value && colPickerRef.value && !colPickerRef.value.contains(e.target as Node)) {
      colPickerOpen.value = false;
    }
  };

  onMounted(() => document.addEventListener('click', onDocClick));
  onUnmounted(() => document.removeEventListener('click', onDocClick));

  return {
    visibleCols,
    colPickerOpen,
    colPickerRef,
    toggleCol,
    colCount,
  };
}
