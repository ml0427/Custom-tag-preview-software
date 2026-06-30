import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGalleryScrollContextKey, useGalleryViewState } from './useGalleryViewState';

describe('useGalleryViewState scroll memory', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
  });

  it('keeps scroll positions scoped by gallery and context', () => {
    const workspaceState = useGalleryViewState('workspace-scroll-test');
    const tagState = useGalleryViewState('tags-scroll-test');

    workspaceState.setScrollTop('source:A|grid', 640);
    tagState.setScrollTop('source:A|grid', 128);

    expect(workspaceState.getScrollTop('source:A|grid')).toBe(640);
    expect(tagState.getScrollTop('source:A|grid')).toBe(128);
    expect(workspaceState.getScrollTop('source:B|grid')).toBe(0);
  });

  it('normalizes invalid scroll positions to the top', () => {
    const state = useGalleryViewState('workspace-invalid-scroll-test');

    state.setScrollTop('source:A|list', Number.NaN);
    expect(state.getScrollTop('source:A|list')).toBe(0);

    state.setScrollTop('source:A|list', -24);
    expect(state.getScrollTop('source:A|list')).toBe(0);
  });

  it('builds distinct context keys for view-affecting state', () => {
    const base = buildGalleryScrollContextKey({
      viewMode: 'grid',
      sourcePath: 'C:/Library',
      selectedTagId: null,
      sortBy: 'name',
      sortDir: 'asc',
      frequentMode: false,
      search: '',
    });

    expect(buildGalleryScrollContextKey({
      viewMode: 'list',
      sourcePath: 'C:/Library',
      selectedTagId: null,
      sortBy: 'name',
      sortDir: 'asc',
      frequentMode: false,
      search: '',
    })).not.toBe(base);

    expect(buildGalleryScrollContextKey({
      viewMode: 'grid',
      sourcePath: 'C:/Library',
      selectedTagId: null,
      sortBy: 'name',
      sortDir: 'asc',
      frequentMode: true,
      search: '',
    })).not.toBe(base);

    expect(buildGalleryScrollContextKey({
      viewMode: 'grid',
      sourcePath: 'C:/Library',
      selectedTagId: 7,
      tagPage: 0,
      sortBy: 'name',
      sortDir: 'asc',
      frequentMode: false,
      search: '',
    })).not.toBe(base);

    expect(buildGalleryScrollContextKey({
      viewMode: 'grid',
      sourcePath: 'C:/Library',
      selectedTagId: 7,
      tagPage: 1,
      sortBy: 'name',
      sortDir: 'asc',
      frequentMode: false,
      search: '',
    })).not.toBe(buildGalleryScrollContextKey({
      viewMode: 'grid',
      sourcePath: 'C:/Library',
      selectedTagId: 7,
      tagPage: 0,
      sortBy: 'name',
      sortDir: 'asc',
      frequentMode: false,
      search: '',
    }));
  });
});
