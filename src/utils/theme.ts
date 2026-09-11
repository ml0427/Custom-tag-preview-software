export const THEME_IDS = ['light', 'dark', 'obsidian', 'forge', 'parchment', 'phosphor'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'light';

export const normalizeTheme = (value: string | null | undefined): ThemeId => {
  return isThemeId(value) ? value : DEFAULT_THEME;
};

export const isThemeId = (value: string | null | undefined): value is ThemeId => (
  typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
);
