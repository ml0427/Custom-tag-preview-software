export const THEME_IDS = ['light', 'dark'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'light';

const LEGACY_THEME_MAP: Record<string, ThemeId> = {
  parchment: 'light',
  obsidian: 'dark',
  forge: 'dark',
  phosphor: 'dark',
};

export const normalizeTheme = (value: string | null | undefined): ThemeId => {
  if (value === 'light' || value === 'dark') return value;
  return value ? LEGACY_THEME_MAP[value] ?? DEFAULT_THEME : DEFAULT_THEME;
};

export const isThemeId = (value: string | null | undefined): value is ThemeId => (
  value === 'light' || value === 'dark'
);
