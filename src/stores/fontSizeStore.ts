import { defineStore } from 'pinia';

export type FontSize = 'small' | 'medium' | 'large';

const STORAGE_KEY = 'app-font-size';
const VALID: FontSize[] = ['small', 'medium', 'large'];

const PX: Record<FontSize, string> = {
  small:  '14px',
  medium: '16px',
  large:  '18px',
};

function isValid(v: string | null): v is FontSize {
  return v !== null && (VALID as string[]).includes(v);
}

function applyToRoot(size: FontSize) {
  document.documentElement.style.setProperty('--font-base-size', PX[size]);
  document.documentElement.setAttribute('data-font-size', size);
}

export const useFontSizeStore = defineStore('fontSize', {
  state: () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return {
      current: (isValid(saved) ? saved : 'medium') as FontSize,
    };
  },
  actions: {
    setFontSize(size: FontSize) {
      this.current = size;
      localStorage.setItem(STORAGE_KEY, size);
      applyToRoot(size);
    },
    init() {
      const fromDom = document.documentElement.getAttribute('data-font-size');
      if (isValid(fromDom)) {
        this.current = fromDom;
      } else {
        applyToRoot(this.current);
      }
    },
  },
});

export const ALL_FONT_SIZES = VALID;
