# Custom Tag Preview Software - UI Design System (AI 參考手冊)

本文件為本專案前端視覺設計規範（Design System），為後續 AI Agent 在擴充組件、調整 CSS 或重構畫面時的**單一真相來源（Single Source of Truth）**。

本系統支援 **4 套風格動態切換**：

| ID | 風格 | 狀態 |
| --- | --- | --- |
| `default` | GitHub Dark 玻璃風 | ⭐ 當前 main 預設 |
| `macos` | MacOS 晶透 | 規格已定，待實作切換 |
| `vercel` | Vercel 極簡黑 | 規格已定，待實作切換 |
| `neon` | Neon 霓虹科技 | 規格已定，待實作切換 |

切換透過 `<html data-theme="...">` 屬性控制，由 Pinia themeStore 統一管理。**組件層只能引用 CSS 變數，禁止 hardcode 任何顏色、邊框、圓角、陰影。**

---

## 💡 1. 共通基礎規範 (Global Principles)

1. **變數化管理**：所有顏色、間距、圓角、陰影必須透過 `:root[data-theme="..."]` CSS 變數定義
2. **間距系統 (Spacing)**：遵循 4px/8px 倍數（4, 8, 12, 16, 24, 32px）
3. **過場動畫 (Transitions)**：基礎互動使用 `transition: all var(--transition-base)`
4. **Icons 規範**：SVG 線條粗細統一 1.5–2px，顏色用 `currentColor` 跟隨文字
5. **內聯樣式禁則**：`.vue` template 禁止寫 `style="color:..." style="background:..."` 等視覺屬性
   - **允許例外 1**：layout 專用屬性（`flex:N`、`width:Npx`、`height:Npx`、`grid-template-columns:...`）
   - **允許例外 2**：資料驅動的色彩（如使用者自訂的標籤色，見 §5.1 Badge）

---

## 🔀 2. 風格切換機制

### 2.0 FOUC 防閃爍（必加）

Vue/Tauri 在 `main.ts` 執行前，HTML 已渲染數十毫秒，會先閃預設樣式才被 JS 改寫。在 `index.html` 的 `<head>` 加入下列 script，**搶在 Vue 掛載前**就先注入 theme：

```html
<head>
  <!-- ...其他 meta/link... -->
  <script>
    (function () {
      const theme = localStorage.getItem('app-theme') || 'default';
      document.documentElement.setAttribute('data-theme', theme);
    })();
  </script>
</head>
```

放置位置：在 `<head>` 內任意位置皆可，但**必須在 Vue 主 script 之前**。Tauri 為純 client-side 環境，這段會在第一個 paint 前同步執行。

實作 themeStore 後仍保留 `init()` 呼叫，但作用變成「讓 store state 與 DOM 同步」（DOM 已先被上面的 script 設好）。

### 2.1 [data-theme] 屬性切換

所有風格變數定義在 `:root[data-theme="X"]` 選擇器下，組件引用 `var(--xxx)` 即可自動跟隨：

```html
<html data-theme="default">  <!-- 預設 -->
<html data-theme="macos">    <!-- 切換 -->
<html data-theme="vercel">
<html data-theme="neon">
```

### 2.2 Pinia themeStore（建議實作）

新增檔案 `src/stores/themeStore.ts`。切換時暫禁 transition 50ms，避免顏色/邊框/圓角全部一起漸變造成「黏」感（採瞬間切換策略）：

```ts
import { defineStore } from 'pinia'

export type ThemeId = 'default' | 'macos' | 'vercel' | 'neon'

const STORAGE_KEY = 'app-theme'
const TRANSITION_DISABLE_MS = 50

export const useThemeStore = defineStore('theme', {
  state: () => ({
    current: (localStorage.getItem(STORAGE_KEY) as ThemeId) || 'default',
  }),
  actions: {
    setTheme(id: ThemeId) {
      const root = document.documentElement

      // 1. 暫禁全域 transition，避免切換瞬間所有元素 300ms 漸變
      root.classList.add('disable-transitions')

      // 2. 套用新主題
      this.current = id
      root.setAttribute('data-theme', id)
      localStorage.setItem(STORAGE_KEY, id)

      // 3. 強制 reflow 讓 .disable-transitions 生效，50ms 後恢復
      void root.offsetHeight
      setTimeout(() => root.classList.remove('disable-transitions'), TRANSITION_DISABLE_MS)
    },
    init() {
      // DOM 的 data-theme 已由 index.html head script 設置（§2.0），
      // 這裡只同步 store state，不再呼叫 setTheme 避免重複套用 + 觸發切換動畫。
      const fromDom = document.documentElement.getAttribute('data-theme') as ThemeId | null
      if (fromDom) this.current = fromDom
    },
  },
})
```

**對應 CSS**（加在 `style.css` §3.2 變數區塊之後）：

```css
.disable-transitions,
.disable-transitions *,
.disable-transitions *::before,
.disable-transitions *::after {
  transition: none !important;
}
```

### 2.3 啟動時初始化

於 `src/main.ts`，Pinia 安裝完成後呼叫 `init()`：

```ts
import { useThemeStore } from './stores/themeStore'

app.use(pinia)
useThemeStore().init()
app.mount('#app')
```

### 2.4 風格切換 UI 入口

放在 `ActivityBar.vue` 底部，做成 4 個 12×12 圓形色塊：

| Theme | 色塊填色 | 備註 |
| --- | --- | --- |
| Default | `#2f81f7` | – |
| MacOS | `#007aff` | – |
| Vercel | `#ffffff` | 加 1px `#333` 邊框 |
| Neon | `#00f3ff` | 加 4px 同色 outer glow |

點擊呼叫 `themeStore.setTheme(id)`。Active 狀態加 1.5px outline。

---

## 🎨 3. CSS 變數對照表

### 3.1 變數命名規約

統一前綴分類，**4 套風格共用同一組變數名**，僅值不同：

| 類別 | 變數 | 用途 |
| --- | --- | --- |
| 背景 | `--bg-app` | App 最外層底色 |
| 背景 | `--bg-panel` | 面板/Sidebar 底色 |
| 背景 | `--bg-elevated` | 浮層（Modal、Dropdown）底色 |
| 背景 | `--bg-input` | 輸入框底色 |
| 背景 | `--bg-hover` | hover 疊色 |
| 邊框 | `--border-subtle` | 微弱分隔線 |
| 邊框 | `--border-default` | 預設邊框 |
| 邊框 | `--border-strong` | 加重邊框 |
| 文字 | `--text-primary` | 主文字 |
| 文字 | `--text-secondary` | 次文字 |
| 文字 | `--text-tertiary` | 弱化文字 |
| 文字 | `--text-on-accent` | accent 上的文字 |
| 強調 | `--accent` | 主強調色 |
| 強調 | `--accent-hover` | 強調色 hover |
| 強調 | `--accent-bg-subtle` | accent 透明背景（弱） |
| 強調 | `--accent-bg-strong` | accent 透明背景（強） |
| 語意 | `--color-danger` | 錯誤/刪除 |
| 語意 | `--color-success` | 成功 |
| 語意 | `--color-warning` | 警告 |
| 語意 | `--color-info` | 訊息 |
| 形狀 | `--radius-sm` | 小圓角（chip、icon button） |
| 形狀 | `--radius-md` | 中圓角（button、input） |
| 形狀 | `--radius-lg` | 大圓角（panel、modal） |
| 形狀 | `--radius-pill` | 膠囊（badge） |
| 陰影 | `--shadow-sm` | 小陰影 |
| 陰影 | `--shadow-md` | 中陰影（卡片） |
| 陰影 | `--shadow-lg` | 大陰影（浮層） |
| 陰影 | `--shadow-glow` | 發光（Neon 主用，其他風格 `none`） |
| 特效 | `--blur-glass` | 毛玻璃模糊量 |
| 動畫 | `--transition-fast` | 100–150ms |
| 動畫 | `--transition-base` | 200–300ms |
| 字體 | `--font-sans` | 主字體 |
| 字體 | `--font-mono` | 等寬字體 |

### 3.2 4 套風格完整變數定義

直接複製此區塊到 `src/style.css`（取代現有 `:root` 區塊）：

```css
:root[data-theme="default"] {
  --bg-app: #0d1117;
  --bg-panel: rgb(22, 27, 34);
  --bg-elevated: rgb(28, 33, 41);
  --bg-input: rgba(0, 0, 0, 0.3);
  --bg-hover: rgba(255, 255, 255, 0.06);

  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-default: rgba(255, 255, 255, 0.15);
  --border-strong: rgba(255, 255, 255, 0.25);

  --text-primary: #e6edf3;
  --text-secondary: #7d8590;
  --text-tertiary: #6e7681;
  --text-on-accent: #ffffff;

  --accent: #2f81f7;
  --accent-hover: #38bdf8;
  --accent-bg-subtle: rgba(47, 129, 247, 0.15);
  --accent-bg-strong: rgba(47, 129, 247, 0.30);

  --color-danger: #f85149;
  --color-success: #2ea043;
  --color-warning: #d29922;
  --color-info: #2f81f7;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 12px;
  --radius-pill: 999px;

  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.4);
  --shadow-glow: none;

  --blur-glass: blur(16px);

  --transition-fast: 100ms ease;
  --transition-base: 300ms ease;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", Consolas, monospace;
}

:root[data-theme="macos"] {
  --bg-app: radial-gradient(circle at top right, #1a2333 0%, #0d1117 100%);
  --bg-panel: rgba(25, 30, 45, 0.4);
  --bg-elevated: rgba(35, 40, 55, 0.6);
  --bg-input: rgba(255, 255, 255, 0.06);
  --bg-hover: rgba(255, 255, 255, 0.08);

  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-default: rgba(255, 255, 255, 0.15);
  --border-strong: rgba(255, 255, 255, 0.25);

  --text-primary: #f5f5f7;
  --text-secondary: #a1a1a6;
  --text-tertiary: #6e6e73;
  --text-on-accent: #ffffff;

  --accent: #007aff;
  --accent-hover: #339fff;
  --accent-bg-subtle: rgba(0, 122, 255, 0.15);
  --accent-bg-strong: rgba(0, 122, 255, 0.30);

  --color-danger: #ff3b30;
  --color-success: #30d158;
  --color-warning: #ff9f0a;
  --color-info: #007aff;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-pill: 999px;

  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.05);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.08);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.10);
  --shadow-glow: none;

  --blur-glass: blur(24px);

  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 300ms cubic-bezier(0.4, 0, 0.2, 1);

  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "SF Mono", "JetBrains Mono", monospace;
}

:root[data-theme="vercel"] {
  --bg-app: #000000;
  --bg-panel: #0a0a0a;
  --bg-elevated: #111111;
  --bg-input: #0a0a0a;
  --bg-hover: #1a1a1a;

  --border-subtle: #1f1f1f;
  --border-default: #333333;
  --border-strong: #888888;

  --text-primary: #ededed;
  --text-secondary: #a1a1a1;
  --text-tertiary: #888888;
  --text-on-accent: #000000;

  --accent: #ffffff;
  --accent-hover: #cccccc;
  --accent-bg-subtle: rgba(255, 255, 255, 0.06);
  --accent-bg-strong: rgba(255, 255, 255, 0.12);

  --color-danger: #ee0000;
  --color-success: #0070f3;
  --color-warning: #f5a623;
  --color-info: #ededed;

  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --radius-pill: 999px;

  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: 0 0 0 1px #333;
  --shadow-glow: none;

  --blur-glass: none;

  --transition-fast: 100ms ease;
  --transition-base: 200ms ease;

  --font-sans: "Inter", -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "Geist Mono", monospace;
}

:root[data-theme="neon"] {
  --bg-app: #050508;
  --bg-panel: rgba(10, 5, 20, 0.8);
  --bg-elevated: rgba(20, 10, 35, 0.9);
  --bg-input: rgba(0, 0, 0, 0.5);
  --bg-hover: rgba(0, 243, 255, 0.06);

  --border-subtle: #1a0033;
  --border-default: #3b0066;
  --border-strong: #00f3ff;

  --text-primary: #f0f0ff;
  --text-secondary: #a89bd6;
  --text-tertiary: #6b5b8e;
  --text-on-accent: #050508;

  --accent: #00f3ff;
  --accent-hover: #66f8ff;
  --accent-bg-subtle: rgba(0, 243, 255, 0.10);
  --accent-bg-strong: rgba(0, 243, 255, 0.25);

  --color-danger: #ff0066;
  --color-success: #00ff88;
  --color-warning: #ffaa00;
  --color-info: #00f3ff;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 999px;

  --shadow-sm: 0 0 8px rgba(0, 243, 255, 0.2);
  --shadow-md: 0 0 12px rgba(0, 243, 255, 0.3);
  --shadow-lg: 0 0 20px rgba(0, 243, 255, 0.4);
  --shadow-glow: 0 0 15px rgba(0, 243, 255, 0.4);

  --blur-glass: none;

  --transition-fast: 150ms ease;
  --transition-base: 300ms ease;

  --font-sans: "Plus Jakarta Sans", "Inter", sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
}
```

---

## 🎭 4. 風格詳細規範

### 4.0 風格 0：Default（GitHub Dark 玻璃風） ⭐ 當前實作

**設計語彙**：開發者熟悉、低調、輕度玻璃感，基於 GitHub Dark 配色。

- **環境背景**：純色 `#0d1117`
- **面板**：實色 `rgb(22, 27, 34)` + 微透明邊框 + 12px 圓角 + 大陰影
- **強調色**：科技藍 `#2f81f7`，hover `#38bdf8`
- **互動**：Primary button hover `translateY(-1px)` + 4px 藍色陰影

### 4.1 風格 1：MacOS 晶透（Frosted Glass）

**設計語彙**：高雅、沉浸感、層次分明，透過高模糊度的背景濾鏡呈現深度。

- **環境背景**：`radial-gradient(circle at top right, #1a2333 0%, #0d1117 100%)`，可疊紋理底圖
- **面板**：低透明 + 24px blur + 高光邊緣 + 內發光陰影 + 16px 圓角
- **強調色**：Apple Blue `#007aff`
- **互動**：卡片 hover `translateY(-4px)` + 加深實體陰影（不發光）

### 4.2 風格 2：Vercel 極簡黑（Minimalist Dark）

**設計語彙**：硬核開發者美學、極高對比、資訊密度高、無視覺干擾。

- **環境背景**：純黑 `#000000`
- **面板**：深灰 `#0a0a0a`–`#111111` + 銳利 1px 實線邊框 + **不使用陰影** + 4px 小圓角
- **強調色**：白色 `#ffffff`（白底黑字 Primary button）
- **互動**：無位移，依賴邊框變色（如 `border-color: #888`）或背景微亮（`background: #1a1a1a`）

### 4.3 風格 3：Neon 霓虹科技（Cyberpunk）

**設計語彙**：電競、動漫感、強烈的高亮對比，使用發光特效吸引視覺焦點。

- **環境背景**：極暗深藍紫 `#050508`，可疊微弱 CSS 網格紋理
- **面板**：低透明深色 + 紫色暗邊 `#3b0066` + 8px 圓角
- **強調色**：螢光藍 `#00f3ff`，輔螢光紫 `#ff00ff`
- **互動**：Active 狀態加外發光 `var(--shadow-glow)` + 邊框變亮；Hover 卡片邊框發亮 + `transform: scale(1.02)`
- **發光文字**：標題、Active Tab 加 `text-shadow: 0 0 10px rgba(0, 243, 255, 0.5)`

---

## 🧩 5. 組件規格

### 5.1 Primitives

#### Button

HTML class 約定：`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`

| 屬性 | 共通規格 |
| --- | --- |
| Padding | `8px 16px` |
| 字體大小 | `0.9rem` |
| 字重 | 500（Vercel 用 600） |
| 圓角 | `var(--radius-md)` |
| Transition | `var(--transition-base)` |

| 變體 | Default | MacOS | Vercel | Neon |
| --- | --- | --- | --- | --- |
| Primary 背景 | `var(--accent)` | `var(--accent)` | `#fff` | `var(--accent)` |
| Primary hover | `var(--accent-hover)` + `translateY(-1px)` + `var(--shadow-md)` | `translateY(-2px)` + `var(--shadow-md)` | `#ccc` | + `box-shadow: var(--shadow-glow)` |
| Danger 樣式 | 透明 + danger 邊框，hover 加淡紅背景 | 同左 | 透明 + danger 文字 | 透明 + glow |
| Ghost | 透明 + `var(--text-secondary)` | 同左 | 同左 | 同左 |

#### Input / Textarea

HTML 約定：原生 `input[type="text"]`、`textarea`，可選 class `.input`

| 屬性 | 規格 |
| --- | --- |
| Padding | `10px 14px` |
| 背景 | `var(--bg-input)` |
| 邊框 | `1px solid var(--border-default)` |
| 圓角 | `var(--radius-md)` |
| 字體大小 | `0.95rem` |
| Focus（Default/MacOS/Neon） | `border-color: var(--accent)` + `box-shadow: 0 0 0 2px var(--accent-bg-subtle)` |
| Focus（Vercel） | 只變邊框色，不加 box-shadow |
| Focus（Neon 加強） | 額外加 `box-shadow: var(--shadow-glow)` |

#### Select

HTML 約定：原生 `<select>`，必加 `appearance: none; -webkit-appearance: none;`（v0.36 規則：避免被系統樣式覆蓋）

| 屬性 | 規格 |
| --- | --- |
| 背景 | `var(--bg-input)` |
| Padding | `10px 36px 10px 14px`（右側留三角形空間） |
| 三角形 | SVG 背景圖嵌入，顏色用 `currentColor` |

#### Modal

HTML class 約定：`.modal-overlay`, `.modal-content`

| 層 | 屬性 |
| --- | --- |
| Overlay | 全螢幕 + `background: rgba(0, 0, 0, 0.5)` + `backdrop-filter: var(--blur-glass)`（Vercel 例外不模糊） |
| Content | `var(--bg-elevated)` + `var(--radius-lg)` + `var(--shadow-lg)` + `max-width: 600px` |
| Header | `padding: 16px 20px`，含標題與 close 按鈕 |
| Body | `padding: 20px`，可滾動 |
| Footer | `padding: 12px 16px`，按鈕靠右排 |

z-index 約定：overlay `1000`，疊在 modal 上的次級 modal `1100`（v0.36 規範）。

#### Toast

HTML class 約定：`.toast`, `.toast-info`, `.toast-success`, `.toast-error`

| 變體 | 背景 |
| --- | --- |
| Info | `var(--color-info)` 90% 透明 |
| Success | `var(--color-success)` 90% 透明 |
| Error | `var(--color-danger)` 90% 透明 |

固定屬性：右下角、`var(--radius-md)`、`var(--shadow-md)`、3 秒淡出、進場 `translateY(20px) → 0`。

#### Badge / Tag Chip

HTML class 約定：`.badge`, `.tag-chip`

| 屬性 | 規格 |
| --- | --- |
| Padding | `2px 8px` |
| 字體 | `0.8rem` |
| 圓角 | `var(--radius-pill)` |
| 預設背景 | `var(--accent-bg-subtle)` |
| 預設文字 | `var(--accent)` |

**自訂色標籤**（v0.36+）：使用 inline `:style="{ background: tag.color + '22', color: tag.color, borderColor: tag.color + '66' }"`。**這是內聯樣式的合法例外**，因為值來自使用者資料而非設計系統。

> ⚠️ **資料層約定（防破版）**：字串拼接 hex alpha（`22` / `66`）**僅對 `#rrggbb` 6 碼格式有效**。若 `tag.color` 是 3 碼縮寫（`#f00`）、`rgb(...)`、`hsl(...)` 或不含 `#`，拼接結果會變成無效 CSS 字串導致破版。
>
> - 存入資料庫前**必須**正規化為 `#rrggbb`，建議共用以下函數（前後端皆可）：
>   ```ts
>   export function normalizeHex(c: string): string | null {
>     const m = c.trim().toLowerCase().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
>     if (!m) return null;
>     const hex = m[1].length === 3 ? m[1].split('').map(ch => ch + ch).join('') : m[1];
>     return '#' + hex;
>   }
>   ```
> - 現存 `src/components/TagSidebar.vue:37-39` 的 `tagStyle()` 未做驗證，屬潛在破版點，建議在後續實作風格切換時一併修補。
> - `COLOR_PRESETS` 內的預設色盤必須以 `#rrggbb` 6 碼宣告，禁止 3 碼縮寫。

#### Card

HTML class 約定：`.card`

| 屬性 | 規格 |
| --- | --- |
| 背景 | `var(--bg-panel)` |
| 邊框 | `1px solid var(--border-default)` |
| 圓角 | `var(--radius-lg)` |
| 陰影 | `var(--shadow-md)` |
| Padding | `16px`–`20px` |
| Hover（Default/MacOS） | `translateY(-2px)` + `var(--shadow-lg)` |
| Hover（Vercel） | `border-color: var(--border-strong)` |
| Hover（Neon） | `box-shadow: var(--shadow-glow)` + `transform: scale(1.02)` |

#### Scrollbar

統一規範（webkit）：

| 屬性 | 規格 |
| --- | --- |
| 寬度 | 8px |
| Track | `var(--bg-app)` |
| Thumb | Default `#30363d`、MacOS `rgba(255,255,255,0.15)`、Vercel `#333`、Neon `var(--accent-bg-strong)` |
| Thumb hover | 加亮 30% 或改用 `var(--accent)` |

---

### 5.2 Feature Panels

#### TagSidebar (`src/components/TagSidebar.vue`)

左側標籤過濾與 CRUD 面板。

| 區塊 | 規格 |
| --- | --- |
| 容器 | `var(--bg-panel)` + 右側 `1px solid var(--border-default)` |
| 寬度 | 240px |
| 搜尋輸入 | 套 §5.1 Input 規格 |
| 標籤列表項 | 高度 32px，hover `var(--bg-hover)`，selected `var(--accent-bg-strong)` 背景 + 左側 3px `var(--accent)` 直條 |
| 標籤色塊 | 12×12 圓形，使用 tag.color（內聯例外） |
| 計數徽章 | 套 §5.1 Badge 規格 |

**現存 hardcoded 待清理**：23+ `rgba(47, 129, 247, ...)` 應全換為 `var(--accent-bg-*)`；8 色預設色盤保留 hex（屬使用者資料）。

#### ActivityBar (`src/components/ActivityBar.vue`)

左側垂直 icon 導覽列。

| 區塊 | 規格 |
| --- | --- |
| 容器 | 寬度 56px、`var(--bg-panel)`、右側 `1px solid var(--border-default)` |
| Icon button | 40×40、`var(--radius-md)`、icon 22×22 |
| Hover | `var(--bg-hover)` |
| Active | `var(--accent-bg-strong)` 背景 + 左側 3px `var(--accent)` 直條 |
| 風格切換 UI | 底部，4 個 12×12 圓形色塊（見 §2.4） |

#### FileExplorerTable Header (`src/components/FileExplorerTable.vue`)

虛擬滾動表頭區。

| 區塊 | 規格 |
| --- | --- |
| 容器 | `var(--bg-elevated)` + 下方 `1px solid var(--border-default)` + `position: sticky; top: 0` |
| 高度 | 36px |
| 字體 | `0.85rem`、`var(--text-secondary)`、字重 500 |
| Cell padding | `0 12px` |
| Resize handle | 寬 4px，hover 顯示 `var(--accent)` |
| Sort indicator | 8×8 三角形，active 時 `var(--accent)` |

---

## ✅ 6. 重構檢查清單（給 AI / 開發者）

實作風格切換或新增組件時，請逐項確認：

- [ ] `style.css` 已含 4 套 `[data-theme]` 的變數區塊（§3.2）
- [ ] `style.css` 已含 `.disable-transitions` rule（§2.2）
- [ ] `index.html` `<head>` 已加 FOUC 防閃爍 script（§2.0）
- [ ] `themeStore.ts` 已建立並在 `main.ts` 啟動時呼叫 `init()`
- [ ] `<html data-theme="...">` 能正確切換
- [ ] 切換瞬間無漸變、無閃爍（首次載入 + 切換中）
- [ ] localStorage key 統一使用 `app-theme`
- [ ] `tag.color` 已正規化為 `#rrggbb` 6 碼（§5.1 Badge 警告框）
- [ ] 組件層**無**任何寫死的 `#xxxxxx` 或 `rgba(...)`（資料驅動的標籤色除外）
- [ ] 無 `style="color:..." style="background:..."` 內聯樣式
- [ ] 所有 `border-radius` 引用 `var(--radius-*)`
- [ ] 所有 `transition` 引用 `var(--transition-*)`
- [ ] 所有 `box-shadow` 引用 `var(--shadow-*)`，發光效果用 `var(--shadow-glow)`
- [ ] 4 套風格的 ActivityBar 切換器都能 1 次點擊生效，重整後保留
- [ ] Modal、Toast、Sidebar 在 4 套風格下視覺都不破版

---

## 📌 給 AI 的最後提示

- **User 要求「換風格」** → 只需呼叫 `themeStore.setTheme()`，不要改 `.vue` 組件內的樣式
- **User 要求「新增組件」** → 先翻 §5 是否已有 primitive，能用就用，不要新造
- **User 要求「微調某顏色」** → 先確認是要改全域 token（§3.2）還是只改某風格的某 token，禁止直接在組件 hardcode
- **§3.2 的 token 不夠用** → 先和 User 確認新增 token 的命名與意圖，加進 4 套風格中**所有**風格都要有對應值（即使是 `none` 或重複值）
- **遇到 `style="..."` 內聯樣式** → 除非是 §1 例外（layout 或資料驅動色），否則一律抽到 scoped CSS 並改用變數
