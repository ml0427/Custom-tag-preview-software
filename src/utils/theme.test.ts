import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useThemeStore } from '../stores/themeStore';
import { DEFAULT_THEME, normalizeTheme } from './theme';

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
  it('maps the former themes to the two supported themes', () => {
    expect(normalizeTheme('parchment')).toBe('light');
    expect(normalizeTheme('obsidian')).toBe('dark');
    expect(normalizeTheme('forge')).toBe('dark');
    expect(normalizeTheme('phosphor')).toBe('dark');
    expect(normalizeTheme('unknown')).toBe(DEFAULT_THEME);
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
  });

  it('keeps the head bootstrap migration map aligned with the helper', () => {
    const bootstrap = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

    expect(bootstrap).toContain("parchment: 'light'");
    expect(bootstrap).toContain("obsidian: 'dark'");
    expect(bootstrap).toContain("forge: 'dark'");
    expect(bootstrap).toContain("phosphor: 'dark'");
    expect(bootstrap).toContain("legacyThemes[savedTheme] || 'light'");
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

  it('migrates a legacy persisted theme and toggles with persistence', () => {
    storage.set('app-theme', 'parchment');
    root.getAttribute.mockReturnValue('light');
    const store = useThemeStore();

    store.init();
    expect(store.current).toBe('light');
    expect(storage.get('app-theme')).toBe('light');

    store.toggleTheme();
    expect(store.current).toBe('dark');
    expect(root.setAttribute).toHaveBeenLastCalledWith('data-theme', 'dark');
    expect(storage.get('app-theme')).toBe('dark');
  });
});
