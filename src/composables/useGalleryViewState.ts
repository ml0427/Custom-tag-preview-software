import { ref, watch } from 'vue';

const VALID_SORT_BY = ['name', 'size', 'date'] as const;
const VALID_SORT_DIR = ['asc', 'desc'] as const;
const VALID_VIEW_MODE = ['list', 'grid'] as const;

type SortBy = typeof VALID_SORT_BY[number];
type SortDir = typeof VALID_SORT_DIR[number];
type ViewMode = typeof VALID_VIEW_MODE[number];

const readStoredValue = <T extends readonly string[]>(
  key: string,
  validValues: T,
  fallback: T[number]
): T[number] => {
  const storedValue = localStorage.getItem(key);
  return validValues.includes(storedValue ?? '') ? storedValue as T[number] : fallback;
};

export function useGalleryViewState(viewStateKey: string) {
  const storagePrefix = `gallery:${viewStateKey}`;
  const sortBy = ref<SortBy>(
    readStoredValue(`${storagePrefix}:sort-by`, VALID_SORT_BY, 'name')
  );
  const sortDir = ref<SortDir>(
    readStoredValue(`${storagePrefix}:sort-dir`, VALID_SORT_DIR, 'asc')
  );
  const viewMode = ref<ViewMode>(
    readStoredValue(`${storagePrefix}:view-mode`, VALID_VIEW_MODE, 'list')
  );
  const gallerySearch = ref(localStorage.getItem(`${storagePrefix}:search`) ?? '');

  watch([sortBy, sortDir, viewMode, gallerySearch], ([by, dir, mode, search]) => {
    localStorage.setItem(`${storagePrefix}:sort-by`, by);
    localStorage.setItem(`${storagePrefix}:sort-dir`, dir);
    localStorage.setItem(`${storagePrefix}:view-mode`, mode);
    localStorage.setItem(`${storagePrefix}:search`, search);
  });

  return {
    sortBy,
    sortDir,
    viewMode,
    gallerySearch,
  };
}
