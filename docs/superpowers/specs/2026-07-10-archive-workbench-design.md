# Archive Workbench 前端重設計

## 摘要

本次把 Custom Tag Preview 的前端統一重設計為「Archive Workbench／典藏工作台」。它不是把現有介面換色，而是重新整理桌面應用的資訊層級，讓來源導航、檔案瀏覽、內容預覽與編輯操作形成一個連續工作流程。

產品仍維持本地桌面檔案管理工具的定位。既有資料模型、Tauri command、掃描流程、標籤邏輯、閱讀器與四套主題都保留；本次主要修改 Vue 畫面結構、元件呈現與 CSS design tokens。

## 目標

- 讓工作區、設定中心、Modal、右鍵選單與狀態提示使用同一套視覺語言。
- 讓第一次使用者能看懂主要區域，不依賴只有圖示的導航。
- 讓高頻操作集中在內容附近，減少工具列、預覽抽屜與右鍵選單之間的跳動。
- 同時支援縮圖瀏覽與高密度列表管理，不偏廢其中一種使用情境。
- 在 1440×900 桌面視窗建立清楚、穩定的三欄工作台，並在較窄視窗保持可用。
- 保留既有功能、快捷鍵、事件與持久化檢視狀態，避免視覺重構造成行為退化。

## 非目標

- 不修改 SQLite schema、Rust 資料層或 Tauri API。
- 不增加雲端同步、推薦、AI 分類或新的內容分析功能。
- 不重寫既有閱讀器的翻頁與全螢幕行為。
- 不移除任何既有主題，也不把本次變成全新的主題編輯器。
- 不引入大型 UI framework 或 icon 套件；圖示使用 repo 內可維護的 SVG 元件。

## 成功標準

- 使用者能從左側清楚分辨「工作目錄、標籤、檔案健檢、設定」。
- 搜尋、顯示模式、排序、常用篩選與批次操作在同一個 command bar 中具備明確優先順序。
- 選取項目後，右側 Inspector 能直接顯示預覽、Metadata、標籤與主要操作，不再像附加抽屜。
- 列表與縮圖模式的選取、雙擊、右鍵、閱讀、重新命名及捲動記憶維持原行為。
- 四套主題在主要頁面、Modal、context menu 與狀態元件上都保持足夠對比。
- 既有測試通過，新增的前端結構測試、CSS lint 與 production build 通過。

## 設計方向比較

### 1. Archive Workbench／典藏工作台（採用）

以專業典藏與內容整理工具為靈感，兼顧封面瀏覽與精密管理。固定的主導航、可收合的情境側欄、中央內容畫布和右側 Inspector 形成穩定工作區。優點是功能密度與辨識度平衡，最符合目前產品的混合使用方式。

### 2. Cinematic Library／電影資料庫

放大封面、減少表格資訊並提高沉浸感。適合純瀏覽，但批次貼標籤、掃描管理與大量檔案整理會變慢，因此不採用。

### 3. Technical Catalogue／技術目錄

以高密度表格、欄位與鍵盤操作為主。管理效率高，但縮圖內容與閱讀情境被弱化，視覺個性也不足，因此不採用。

## 資訊架構

### 應用程式框架

畫面由四個穩定區域組成：

1. **Primary rail**：寬約 72px，顯示產品標記與四個帶文字提示的主要入口。圖示不再使用 emoji。
2. **Context sidebar**：預設寬約 260px，依入口顯示來源樹或標籤；可收合，但主要入口切換不再讓中央畫面失去上下文。
3. **Content canvas**：包含頁面標頭、command bar、資訊列與列表／縮圖內容。
4. **Inspector**：預設寬約 320px，選取內容後顯示預覽、標籤、Metadata 與操作；可收合並保留寬度狀態。

設定與檔案健檢仍是完整頁面，但沿用相同的 primary rail、頁面標頭、卡片與按鈕語言。

### 工作區標頭

標頭第一列顯示目前來源或標籤名稱、路徑摘要、項目數與目前狀態。第二列為 command bar：

- 左側：搜尋欄，保留原搜尋行為。
- 中段：列表／縮圖 segmented control、常用模式、排序與篩選。
- 右側：情境操作與 Inspector 開關。
- 多選時：command bar 轉為 selection mode，優先顯示選取數量、加／移標籤與刪除，並保留取消選取入口。

### Context sidebar

- 工作目錄顯示來源群組、目前路徑與樹狀結構；新增來源改為清楚的次要按鈕。
- 標籤模式加入標題、標籤數與搜尋／管理入口，選取狀態使用左側 accent bar 和淡色背景。
- 收合時只留下 primary rail，不另外保留空白側欄。

### 內容瀏覽

縮圖卡採較清楚的三層結構：封面、主標題、輔助 Metadata。類別、頁數與開啟次數使用一致的小型 badge；標籤只顯示最重要的數個，超出以數量表示。hover 顯示閱讀等高頻動作，但不遮住標題。

列表模式維持虛擬捲動和欄位設定，重新整理 header、選取狀態、縮圖與 row actions，使欄位密度一致。排序仍由現有資料層控制。

空狀態使用簡短標題、一句下一步與單一主要動作，不放裝飾性大面積插圖。

### Inspector

Inspector 是 `PreviewPane` 的重新定位，不建立第二套編輯資料流：

- 頂部：封面／媒體預覽和內容類型。
- 中段：檔名、路徑、大小、日期、頁數等 Metadata。
- 標籤區：顯示與快速編輯，沿用現有事件與 `PreviewEditPanel`。
- 底部：閱讀／系統開啟等主要動作；刪除等破壞性操作維持較低層級。

沒有選取項目時顯示精簡提示；Inspector 收合時中央內容自動擴展。

## 視覺系統

### 基礎語言

- 預設 Obsidian 主題採深石墨黑與帶藍灰的分層表面，accent 延續暖琥珀色。
- 表面層級以背景色、1px 邊線和輕微陰影區分，不大量使用玻璃模糊。
- 圓角控制在 6–12px；互動控制一致使用 8px 左右，避免同頁混用過多半徑。
- 大標題延續設定中心目前的編輯感，但工作區工具列保持緊湊。
- 中文內容使用清楚的 sans-serif；檔案 Metadata、快捷鍵與統計使用 mono 字體。
- 動畫只用於側欄收合、Inspector 顯示、選取與 hover，時間控制在約 120–200ms。

### Design tokens

保留 `themes.css` 的主題切換方式，但整理語意 token：

- `--surface-canvas`、`--surface-panel`、`--surface-raised`、`--surface-hover`
- `--line-subtle`、`--line-default`、`--line-strong`
- `--content-primary`、`--content-secondary`、`--content-muted`
- `--control-height-sm`、`--control-height-md`、`--panel-gap`

舊 token 在遷移期間可映射到新 token，避免一次修改所有低風險元件。四個主題只覆寫 token 值，不分叉元件 CSS。

### 圖示

建立小型 repo-local SVG icon 元件或 icon map，統一 `currentColor`、線寬與 16／18／20px 尺寸。首批替換 primary rail、檢視切換、搜尋、常用、Inspector、設定與常見 row actions；檔案類型圖示可暫時保留既有內容識別，後續再按同一規格換掉。

## 元件與責任邊界

- `App.vue`：只負責應用 shell、主要路由狀態、sidebar／Inspector 區域協調與全域掃描狀態。
- `ActivityBar.vue`：改為 primary rail，只發送入口選擇，不持有頁面資料。
- `ItemGallery.vue`：仍是工作區協調層，負責 selection、view state、modal 與 reader wiring。
- `GalleryToolbar.vue`：演進為 command bar，使用明確 props／events，不直接載入資料。
- `GalleryInfoBar.vue`：承擔路徑、項目數、搜尋／篩選摘要，不和 command bar 重複。
- `ThumbnailGridView.vue`、`ThumbnailCard.vue`：只處理縮圖布局與卡片呈現。
- `FileExplorerTable.vue`：只處理列表、欄位、虛擬捲動與 row interactions。
- `PreviewPane.vue`、`PreviewEditPanel.vue`：組成 Inspector，但沿用既有資料與事件介面。
- `SettingsPanel.vue`、`FileHealthView.vue`：套用共同 page shell、card 和 control 樣式，不改功能邏輯。
- 新增共用 icon 與基礎控制元件時，只抽取重複且界面穩定的部分；不建立通用元件框架。

## 資料流與狀態

本次不新增平行資料來源。`ItemGallery` 仍取得 gallery 資料並把項目、selection、sorting 和 view state 傳給子元件；command bar 透過既有 emit 更新狀態；Inspector 使用目前 selected item 與現有更新事件回傳。

需要新增的純 UI 狀態限於：

- context sidebar 是否收合。
- Inspector 是否收合與寬度。
- 小視窗下目前開啟哪個 overlay panel。

可持久化的寬度與收合狀態沿用 gallery view state／local storage 類型的本地機制，不寫入後端資料庫。

## 響應式與視窗策略

- `>= 1280px`：四區完整顯示。
- `960–1279px`：context sidebar 可自動縮窄，Inspector 預設收合但可覆蓋打開。
- `< 960px`：只保留 primary rail 與 content canvas；context sidebar／Inspector 以 overlay 顯示。
- 不以手機觸控介面為目標，但所有主要控制保持至少約 32px 的可點擊尺寸。

## 錯誤、載入與狀態回饋

- 載入中使用與內容形狀接近的局部 skeleton 或輕量 spinner，不覆蓋整個工作區。
- 空結果、尚未選來源、搜尋無結果與常用模式無內容使用不同文案與下一步。
- API 錯誤沿用現有 toast；Toast 視覺會納入新系統，但不改錯誤處理邏輯。
- 掃描進度改為底部浮動 status capsule，仍保留取消與項目名稱。
- 破壞性操作維持既有確認流程，不因重新排版變成更容易誤觸的主要按鈕。

## 無障礙與鍵盤

- 所有純圖示按鈕必須保留 `aria-label` 或可辨識 title。
- focus-visible 樣式在四個主題中都需清楚可見。
- segmented control、sidebar item、row action 和 Inspector tab 使用正確 button semantics。
- 現有方向鍵、Enter、Delete、F2、Escape 與多選修飾鍵行為不得退化。
- 色彩不作為選取、錯誤或狀態的唯一訊號。

## 實作切面

實作分成可獨立驗證的五個切面：

1. **Foundation**：token、字體、focus、buttons、inputs、cards、SVG icons。
2. **Application shell**：primary rail、context sidebar、content canvas、Inspector layout。
3. **Gallery workspace**：header、command bar、info bar、empty states、list、grid、selection mode。
4. **Inspector and overlays**：preview／edit、Modal、context menu、toast、scan status。
5. **Secondary pages and themes**：settings、file health、四套主題與窄視窗修整。

每個切面完成後都能單獨 build 與視覺檢查，避免把整個 redesign 壓成一次不可審查的 CSS 改動。

## 測試與驗證

### 自動化

- 保留並執行全部 `npm test`。
- 對 application shell、command bar、Inspector wiring 與關鍵 icon button 新增 source／component contract tests。
- 執行 `npm run lint:css`。
- 執行 `npm run build`。

### 行為回歸

- 工作目錄／標籤／檔案健檢／設定切換。
- 列表與縮圖切換、常用模式、搜尋、排序與欄位設定。
- 單選、多選、右鍵、重新命名、刪除、閱讀與系統開啟。
- Preview／Inspector 開關、寬度調整、標籤與 Metadata 編輯。
- reader 開關後的捲動位置恢復。
- 掃描進度、取消、toast 與 Modal stacking。

### 視覺 QA

- Obsidian 主題以 1440×900 為主要檢查尺寸。
- Forge、Parchment、Phosphor 各檢查 workspace、settings、Modal 和 context menu。
- 1280px、1024px 與窄於 960px 各檢查一次收合／overlay 行為。
- 檢查 hover、focus、selected、disabled、loading、empty 和 error 狀態。

## 風險與控制

- **大範圍 CSS 互相污染**：優先使用 scoped styles 和語意 token；共用樣式只放穩定 primitive。
- **`ItemGallery.vue` 過度膨脹**：不把新視覺控制邏輯全部留在協調層，command bar 和 Inspector 維持明確介面。
- **四主題對比退化**：以 token 驗證而非針對單一主題寫局部色碼。
- **列表／縮圖事件退化**：保留現有 emit contract，先以測試固定互動再改模板。
- **Tauri browser preview 缺少本地資料**：source-level tests 驗證事件契約，實際 Tauri app 驗證有資料時的渲染與互動。

## 交付邊界

本分支交付一套可運作的完整前端重設計，而非靜態 mockup。既有功能若因重新排版暴露小型視覺缺陷，可在相同元件內修正；涉及新產品功能、後端資料或閱讀器演算法的需求留待後續獨立任務。
