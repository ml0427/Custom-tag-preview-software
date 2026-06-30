import { ref, watch } from 'vue';

const VALID_SORT_BY = ['name', 'size', 'date'] as const;
const VALID_SORT_DIR = ['asc', 'desc'] as const;
const VALID_VIEW_MODE = ['list', 'grid'] as const;

type SortBy = typeof VALID_SORT_BY[number];
type SortDir = typeof VALID_SORT_DIR[number];
type ViewMode = typeof VALID_VIEW_MODE[number];

export interface GalleryScrollContextInput {
  viewMode: ViewMode;
  sourcePath: string | null;
  selectedTagId: number | null | undefined;
  tagPage?: number;
  sortBy: SortBy;
  sortDir: SortDir;
  frequentMode: boolean;
  search: string;
}

const galleryScrollPositions = new Map<string, number>();

export const buildGalleryScrollContextKey = ({
  viewMode,
  sourcePath,
  selectedTagId,
  tagPage,
  sortBy,
  sortDir,
  frequentMode,
  search,
}: GalleryScrollContextInput): string => JSON.stringify({
  viewMode,
  scope: selectedTagId != null
    ? { type: 'tag', id: selectedTagId, page: tagPage ?? 0 }
    : { type: 'source', path: sourcePath ?? '' },
  sortBy,
  sortDir,
  frequentMode,
  search: search.trim(),
});

const readStoredValue = <T extends readonly string[]>(
  key: string,
  validValues: T,
  fallback: T[number]
): T[number] => {
  const storedValue = localStorage.getItem(key);
  return validValues.includes(storedValue ?? '') ? storedValue as T[number] : fallback;
};

const readStoredBoolean = (key: string, fallback: boolean): boolean => {
  const storedValue = localStorage.getItem(key);
  if (storedValue === 'true') return true;
  if (storedValue === 'false') return false;
  return fallback;
};

export function useGalleryViewState(viewStateKey: string) {
  const storagePrefix = `gallery:${viewStateKey}`;
  const scrollStorageKey = (contextKey: string) => `${storagePrefix}:scroll:${contextKey}`;
  const normalizeScrollTop = (value: number): number => (
    Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  );

  const sortBy = ref<SortBy>(
    readStoredValue(`${storagePrefix}:sort-by`, VALID_SORT_BY, 'name')
  );
  const sortDir = ref<SortDir>(
    readStoredValue(`${storagePrefix}:sort-dir`, VALID_SORT_DIR, 'asc')
  );
  const viewMode = ref<ViewMode>(
    readStoredValue(`${storagePrefix}:view-mode`, VALID_VIEW_MODE, 'list')
  );
  const frequentMode = ref(
    readStoredBoolean(`${storagePrefix}:frequent-mode`, false)
  );
  const gallerySearch = ref(localStorage.getItem(`${storagePrefix}:search`) ?? '');

  watch([sortBy, sortDir, viewMode, frequentMode, gallerySearch], ([by, dir, mode, frequent, search]) => {
    localStorage.setItem(`${storagePrefix}:sort-by`, by);
    localStorage.setItem(`${storagePrefix}:sort-dir`, dir);
    localStorage.setItem(`${storagePrefix}:view-mode`, mode);
    localStorage.setItem(`${storagePrefix}:frequent-mode`, String(frequent));
    localStorage.setItem(`${storagePrefix}:search`, search);
  });

  const getScrollTop = (contextKey: string): number => (
    galleryScrollPositions.get(scrollStorageKey(contextKey)) ?? 0
  );

  const setScrollTop = (contextKey: string, nextScrollTop: number) => {
    const top = normalizeScrollTop(nextScrollTop);
    const key = scrollStorageKey(contextKey);
    if (top === 0) {
      galleryScrollPositions.delete(key);
      return;
    }
    galleryScrollPositions.set(key, top);
  };

  return {
    sortBy,
    sortDir,
    viewMode,
    frequentMode,
    gallerySearch,
    getScrollTop,
    setScrollTop,
  };
}
