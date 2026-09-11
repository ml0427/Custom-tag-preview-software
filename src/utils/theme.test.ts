import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useThemeStore } from '../stores/themeStore';
import { DEFAULT_THEME, normalizeTheme, THEME_IDS } from './theme';

const storage = new Map<string, string>();
const root = {
  classList: { add: vi.fn(), remove: vi.fn() },
  getAttribute: vi.fn<(name: string) => string | null>(),
  setAttribute: vi.fn(),
  offsetHeight: 0,
};

beforeEach(() => {
  storage.clear();
  root.getAttribute.mockReset();
  root.setAttribute.mockReset();
  root.classList.add.mockReset();
  root.classList.remove.mockReset();
  root.getAttribute.mockReturnValue(null);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('document', { documentElement: root });
  setActivePinia(createPinia());
});

describe('theme normalization', () => {
  it.each(THEME_IDS)('preserves the saved %s palette', theme => {
    expect(normalizeTheme(theme)).toBe(theme);
  });

  it('defaults safely for unknown values', () => {
    expect(normalizeTheme('unknown')).toBe(DEFAULT_THEME);
    expect(normalizeTheme('toString')).toBe(DEFAULT_THEME);
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
  });

  it.each([...THEME_IDS, 'unknown', 'toString', null])('bootstraps %s without converting existing choices', saved => {
    const bootstrap = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const script = bootstrap.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    const setAttribute = vi.fn();
    runInNewContext(script!, {
      localStorage: { getItem: (key: string) => key === 'app-theme' ? saved : null },
      document: { documentElement: { setAttribute, style: { setProperty: vi.fn() } } },
    });
    expect(setAttribute).toHaveBeenCalledWith('data-theme', normalizeTheme(saved));
  });
});

describe('useThemeStore', () => {
  it('defaults to light and synchronizes the bootstrap theme during init', () => {
    const store = useThemeStore();

    expect(store.current).toBe('light');
    store.init();

    expect(root.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    expect(storage.get('app-theme')).toBe('light');
  });

  it.each(THEME_IDS)('initializes and saves %s unchanged', theme => {
    storage.set('app-theme', theme);
    root.getAttribute.mockReturnValue(theme);
    const store = useThemeStore();
    store.init();
    expect(store.current).toBe(theme);
    expect(storage.get('app-theme')).toBe(theme);
  });

  it('preserves a saved palette when the bootstrap attribute is missing', () => {
    storage.set('app-theme', 'parchment');
    const store = useThemeStore();
    store.init();
    expect(store.current).toBe('parchment');
    expect(storage.get('app-theme')).toBe('parchment');
  });

  it('cycles through all six palettes and persists each choice', () => {
    const store = useThemeStore();
    for (const theme of [...THEME_IDS.slice(1), THEME_IDS[0]]) {
      store.toggleTheme();
      expect(store.current).toBe(theme);
      expect(root.setAttribute).toHaveBeenLastCalledWith('data-theme', theme);
      expect(storage.get('app-theme')).toBe(theme);
    }
  });
});
