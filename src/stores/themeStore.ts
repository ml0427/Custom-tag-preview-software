import { defineStore } from 'pinia';

export type ThemeId = 'obsidian' | 'forge' | 'parchment' | 'phosphor';

const STORAGE_KEY = 'app-theme';
const TRANSITION_DISABLE_MS = 50;

const VALID_THEMES: ThemeId[] = ['obsidian', 'forge', 'parchment', 'phosphor'];

function isValidTheme(v: string | null): v is ThemeId {
  return v !== null && (VALID_THEMES as string[]).includes(v);
}

export const useThemeStore = defineStore('theme', {
  state: () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return {
      current: (isValidTheme(saved) ? saved : 'obsidian') as ThemeId,
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
    /**
     * 啟動時呼叫。data-theme 已由 index.html head script 設置（避免 FOUC），
     * 此處只同步 store state 與 DOM，不重新呼叫 setTheme。
     */
    init() {
      const fromDom = document.documentElement.getAttribute('data-theme');
      if (isValidTheme(fromDom)) {
        this.current = fromDom;
      } else {
        // DOM 沒有合法 data-theme（理論不應發生）→ 補套用 store 既有值
        this.setTheme(this.current);
      }
    },
  },
});

export const ALL_THEMES = VALID_THEMES;
