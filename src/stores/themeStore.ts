import { defineStore } from 'pinia';
import { isThemeId, normalizeTheme, THEME_IDS, type ThemeId } from '../utils/theme';

export type { ThemeId } from '../utils/theme';

const STORAGE_KEY = 'app-theme';
const TRANSITION_DISABLE_MS = 50;

export const useThemeStore = defineStore('theme', {
  state: () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return {
      current: normalizeTheme(saved),
    };
  },
  actions: {
    setTheme(id: ThemeId) {
      const root = document.documentElement;

      // 1. 暫禁全域 transition，避免切換瞬間色彩漸變的「黏」感
      root.classList.add('disable-transitions');

      // 2. 套用新主題
      this.current = id;
      root.setAttribute('data-theme', id);
      localStorage.setItem(STORAGE_KEY, id);

      // 3. 強制 reflow 讓 .disable-transitions 生效，50ms 後恢復
      void root.offsetHeight;
      setTimeout(() => root.classList.remove('disable-transitions'), TRANSITION_DISABLE_MS);
    },
    toggleTheme() {
      const nextIndex = (THEME_IDS.indexOf(this.current) + 1) % THEME_IDS.length;
      this.setTheme(THEME_IDS[nextIndex]!);
    },
    /**
     * 啟動時呼叫。data-theme 已由 index.html head script 設置（避免 FOUC），
     * 此處只同步 store state 與 DOM，不重新呼叫 setTheme。
     */
    init() {
      const domTheme = document.documentElement.getAttribute('data-theme');
      const fromDom = isThemeId(domTheme) ? domTheme : this.current;
      this.current = fromDom;
      document.documentElement.setAttribute('data-theme', fromDom);
      localStorage.setItem(STORAGE_KEY, fromDom);
    },
  },
});

export const ALL_THEMES = THEME_IDS;
