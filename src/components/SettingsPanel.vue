<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { api } from '../api';
import { useItemTypes } from '../composables/useItemTypes';
import { useThemeStore, type ThemeId } from '../stores/themeStore';
import { useFontSizeStore, type FontSize } from '../stores/fontSizeStore';
import { useToast } from '../composables/useToast';
import { useTags } from '../composables/useTags';
import CategoryManageModal from './CategoryManageModal.vue';

const emit = defineEmits<{
  (e: 'categorySaved'): void;
  (e: 'tagsChanged'): void;
}>();

type SettingsSectionId = 'automation' | 'appearance' | 'system';

const { itemTypes, load: loadItemTypes } = useItemTypes();
const themeStore = useThemeStore();
const fontSizeStore = useFontSizeStore();
const { show: showToast, confirm: confirmDialog } = useToast();
const { loadTags } = useTags();

const showCategoryManage = ref(false);
const activeSection = ref<SettingsSectionId>('automation');

const isDeletingEmptyTags = ref(false);

const handleDeleteEmptyTags = async () => {
  if (!await confirmDialog('確定刪除所有沒有資料的標籤？此操作不會刪除漫畫或資料夾。')) return;
  isDeletingEmptyTags.value = true;
  try {
    const deleted = await api.deleteEmptyTags();
    await loadTags();
    emit('tagsChanged');
    showToast(`已刪除 ${deleted} 個空標籤`, 'success');
  } catch (e) {
    showToast(`刪除失敗：${e}`, 'error');
  } finally {
    isDeletingEmptyTags.value = false;
  }
};

const debugMode = ref(false);
const debugLogPath = ref('');

const handleCategoryClose = () => {
  showCategoryManage.value = false;
  loadItemTypes(true);
  emit('categorySaved');
};

const onToggleDebug = async () => {
  try {
    await api.setDebugMode(debugMode.value);
    showToast(debugMode.value ? 'Debug 模式已開啟' : 'Debug 模式已關閉', 'success');
  } catch (e) {
    debugMode.value = !debugMode.value;
    showToast(`設定失敗：${e}`, 'error');
  }
};

const onOpenDebugLog = async () => {
  try {
    await api.openDebugLog();
  } catch (e) {
    showToast(`開啟日誌失敗：${e}`, 'error');
  }
};

const onClearDebugLog = async () => {
  if (!await confirmDialog('確定要清空 debug 日誌嗎？')) return;
  try {
    await api.clearDebugLog();
    showToast('日誌已清空', 'success');
  } catch (e) {
    showToast(`清空失敗：${e}`, 'error');
  }
};

onMounted(async () => {
  try {
    const [nextDebugMode, nextDebugLogPath] = await Promise.all([
      api.getDebugMode(),
      api.getDebugLogPath(),
      loadItemTypes(),
    ]);
    debugMode.value = nextDebugMode;
    debugLogPath.value = nextDebugLogPath;
  } catch (e) {
    console.error('[SettingsPanel] load settings state failed', e);
  }
});

const fontSizes: { id: FontSize; label: string; detail: string }[] = [
  { id: 'small',  label: '小', detail: '高密度清單' },
  { id: 'medium', label: '中', detail: '平衡閱讀' },
  { id: 'large',  label: '大', detail: '遠距觀看' },
];

const themes: { id: ThemeId; label: string; detail: string; color: string }[] = [
  { id: 'obsidian',  label: 'Obsidian · Amber',    detail: '暗色琥珀，高對比工作台', color: '#f0b429' },
  { id: 'forge',     label: 'Forge · Industrial',  detail: '工業深灰，銳利邊界', color: '#ff6b35' },
  { id: 'parchment', label: 'Parchment · Archive', detail: '暖色紙本，適合長時間整理', color: '#b0431e' },
  { id: 'phosphor',  label: 'Phosphor · Terminal', detail: '終端機綠光，極簡資訊密度', color: '#00ff41' },
];

const settingsSections: { id: SettingsSectionId; eyebrow: string; title: string; description: string }[] = [
  {
    id: 'automation',
    eyebrow: 'Tags & automation',
    title: '標籤與自動化',
    description: '維護標籤規則集、清理空標籤；規則只負責輔助套標，不改變資料夾本身。',
  },
  {
    id: 'appearance',
    eyebrow: 'Appearance',
    title: '外觀與閱讀密度',
    description: '調整字型大小與主題，讓資料整理介面符合你的工作距離。',
  },
  {
    id: 'system',
    eyebrow: 'System',
    title: '系統與診斷',
    description: '語言、Debug log 與低階診斷入口。',
  },
];

const currentSection = computed(() => settingsSections.find(section => section.id === activeSection.value) ?? settingsSections[0]);
const currentThemeLabel = computed(() => themes.find(theme => theme.id === themeStore.current)?.label ?? themeStore.current);
const ruleSetCount = computed(() => itemTypes.value.length);
const builtinRuleSetCount = computed(() => itemTypes.value.filter(type => type.isBuiltin).length);
const customRuleSetCount = computed(() => itemTypes.value.filter(type => !type.isBuiltin).length);
const totalRuleCount = computed(() => itemTypes.value.reduce((sum, type) => sum + type.tagRules.length, 0));
</script>

<template>
  <div class="settings-panel">
    <header class="settings-hero">
      <div class="hero-copy">
        <span class="eyebrow">Settings</span>
        <h2>設定中心</h2>
        <p>把外觀、標籤規則集與診斷工具分開管理；資料夾維持單純容器，語意交給標籤。</p>
      </div>
      <div class="hero-metrics" aria-label="設定摘要">
        <span class="metric-pill"><strong>{{ ruleSetCount }}</strong> 規則集</span>
        <span class="metric-pill"><strong>{{ totalRuleCount }}</strong> 自動規則</span>
        <span class="metric-pill accent-pill">{{ currentThemeLabel }}</span>
      </div>
    </header>

    <div class="settings-shell">
      <aside class="settings-rail" aria-label="設定分類">
        <button
          v-for="section in settingsSections"
          :key="section.id"
          type="button"
          class="rail-item"
          :class="{ active: activeSection === section.id }"
          @click="activeSection = section.id"
        >
          <span class="rail-eyebrow">{{ section.eyebrow }}</span>
          <span class="rail-title">{{ section.title }}</span>
        </button>
      </aside>

      <main class="settings-content">
        <div class="section-intro">
          <span class="eyebrow">{{ currentSection.eyebrow }}</span>
          <h3>{{ currentSection.title }}</h3>
          <p>{{ currentSection.description }}</p>
        </div>

        <section v-if="activeSection === 'automation'" class="card-grid card-grid--automation">
          <article class="settings-card featured-card">
            <div class="card-header">
              <div>
                <span class="card-kicker">Automation library</span>
                <h4>標籤規則集</h4>
              </div>
              <span class="card-count">{{ ruleSetCount }}</span>
            </div>
            <p class="card-copy">
              規則集是套標籤的自動化模板，可被資料夾預設引用；它不改變資料夾本身。
            </p>
            <div class="stat-row">
              <span><strong>{{ builtinRuleSetCount }}</strong> 內建</span>
              <span><strong>{{ customRuleSetCount }}</strong> 自訂</span>
              <span><strong>{{ totalRuleCount }}</strong> 規則</span>
            </div>
            <button type="button" class="primary-action" @click="showCategoryManage = true">
              管理規則集
            </button>
          </article>

          <article class="settings-card">
            <div class="card-header">
              <div>
                <span class="card-kicker">Tag hygiene</span>
                <h4>清理空標籤</h4>
              </div>
            </div>
            <p class="card-copy">
              移除沒有連到任何檔案或資料夾的標籤，保留所有內容與資料夾本身。
            </p>
            <button
              type="button"
              class="secondary-action danger-action"
              :disabled="isDeletingEmptyTags"
              @click="handleDeleteEmptyTags"
            >
              {{ isDeletingEmptyTags ? '刪除中...' : '刪除空標籤' }}
            </button>
          </article>
        </section>

        <section v-else-if="activeSection === 'appearance'" class="card-grid">
          <article class="settings-card">
            <div class="card-header">
              <div>
                <span class="card-kicker">Density</span>
                <h4>字型大小</h4>
              </div>
            </div>
            <div class="density-options" role="group" aria-label="字型大小">
              <button
                v-for="size in fontSizes"
                :key="size.id"
                type="button"
                class="density-option"
                :class="{ active: fontSizeStore.current === size.id }"
                @click="fontSizeStore.setFontSize(size.id)"
              >
                <span class="density-label">{{ size.label }}</span>
                <span class="density-detail">{{ size.detail }}</span>
              </button>
            </div>
          </article>

          <article class="settings-card wide-card">
            <div class="card-header">
              <div>
                <span class="card-kicker">Theme</span>
                <h4>主題風格</h4>
              </div>
            </div>
            <div class="theme-grid">
              <button
                v-for="theme in themes"
                :key="theme.id"
                type="button"
                class="theme-card"
                :class="{ active: themeStore.current === theme.id }"
                @click="themeStore.setTheme(theme.id)"
              >
                <span class="theme-swatch" :style="{ background: theme.color }"></span>
                <span class="theme-copy">
                  <span class="theme-label">{{ theme.label }}</span>
                  <span class="theme-detail">{{ theme.detail }}</span>
                </span>
                <span v-if="themeStore.current === theme.id" class="theme-check">✓</span>
              </button>
            </div>
          </article>
        </section>

        <section v-else class="card-grid">
          <article class="settings-card">
            <div class="card-header">
              <div>
                <span class="card-kicker">Language</span>
                <h4>語言</h4>
              </div>
            </div>
            <div class="field-stack">
              <select class="field-control" disabled>
                <option>繁體中文</option>
              </select>
              <span class="field-hint">i18n 規劃中，目前固定繁體中文。</span>
            </div>
          </article>

          <article class="settings-card wide-card">
            <div class="card-header">
              <div>
                <span class="card-kicker">Diagnostics</span>
                <h4>Debug 模式</h4>
              </div>
              <span class="status-pill" :class="{ active: debugMode }">{{ debugMode ? 'ON' : 'OFF' }}</span>
            </div>
            <label class="debug-toggle">
              <input type="checkbox" v-model="debugMode" @change="onToggleDebug" />
              <span>
                <strong>啟用 debug log</strong>
                <small>關鍵 mutation 操作會寫入日誌檔，方便追查資料異常。</small>
              </span>
            </label>
            <div class="log-path-card">
              <span class="field-label">日誌路徑</span>
              <span class="debug-path" :title="debugLogPath">{{ debugLogPath || '—' }}</span>
            </div>
            <div class="button-row">
              <button type="button" class="secondary-action" @click="onOpenDebugLog">開啟日誌</button>
              <button type="button" class="secondary-action danger-action" @click="onClearDebugLog">清空日誌</button>
            </div>
          </article>
        </section>
      </main>
    </div>
  </div>

  <CategoryManageModal :visible="showCategoryManage" @close="handleCategoryClose" />
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at 16% 0%, var(--accent-bg-subtle), transparent 30%),
    var(--bg-app);
}

.settings-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 32px 40px 24px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.hero-copy,
.section-intro,
.card-header > div,
.theme-copy,
.debug-toggle span {
  min-width: 0;
}

.eyebrow,
.card-kicker,
.rail-eyebrow {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-tertiary);
  font-size: 0.65rem;
  font-weight: 500;
}

.settings-hero h2,
.section-intro h3,
.settings-card h4 {
  margin: 0;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.settings-hero h2 {
  margin-top: 8px;
  font-size: clamp(1.9rem, 3vw, 3rem);
  line-height: 1;
  font-weight: 600;
}

.settings-hero p,
.section-intro p,
.card-copy,
.field-hint {
  color: var(--text-secondary);
  line-height: 1.6;
}

.settings-hero p {
  max-width: 720px;
  margin: 12px 0 0;
  font-size: 0.95rem;
}

.hero-metrics {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.metric-pill,
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border-default);
  background: var(--bg-overlay-soft);
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  padding: 6px 10px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  white-space: nowrap;
}

.metric-pill strong,
.stat-row strong {
  color: var(--text-primary);
  font-weight: 600;
}

.accent-pill,
.status-pill.active {
  border-color: var(--accent-border);
  background: var(--accent-bg-subtle);
  color: var(--accent);
}

.settings-shell {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.settings-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px 16px 24px 24px;
  border-right: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--bg-panel) 82%, transparent);
  overflow-y: auto;
}

.rail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.rail-item:hover {
  background: var(--bg-overlay-soft);
  color: var(--text-primary);
}

.rail-item.active {
  background: var(--accent-bg-subtle);
  border-color: var(--accent-border);
  color: var(--text-primary);
}

.rail-title {
  font-size: 0.92rem;
  font-weight: 600;
}

.settings-content {
  overflow-y: auto;
  padding: 28px 40px 40px;
  min-width: 0;
}

.section-intro {
  max-width: 760px;
  margin-bottom: 20px;
}

.section-intro h3 {
  margin-top: 6px;
  font-size: 1.35rem;
}

.section-intro p {
  margin: 8px 0 0;
  font-size: 0.9rem;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  max-width: 1040px;
}

.card-grid--automation {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
}

.settings-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-elevated) 72%, transparent);
  box-shadow: var(--shadow-sm);
}

.featured-card {
  background:
    linear-gradient(135deg, var(--accent-bg-subtle), transparent 58%),
    color-mix(in srgb, var(--bg-elevated) 78%, transparent);
}

.wide-card {
  grid-column: span 2;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.settings-card h4 {
  margin-top: 4px;
  font-size: 1rem;
  font-weight: 600;
}

.card-copy {
  margin: 0;
  font-size: 0.86rem;
}

.card-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--accent-bg-subtle);
  color: var(--accent);
  font-family: var(--font-mono);
  font-weight: 600;
}

.stat-row,
.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.stat-row span {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  padding: 6px 9px;
  color: var(--text-secondary);
  background: var(--bg-overlay-soft);
  font-size: 0.78rem;
}

.primary-action,
.secondary-action {
  border-radius: var(--radius-md);
  padding: 9px 12px;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), opacity var(--transition-fast);
}

.primary-action {
  align-self: flex-start;
  border: 1px solid var(--accent-border);
  background: var(--accent);
  color: var(--text-on-accent);
  box-shadow: var(--shadow-accent-elevated);
}

.primary-action:hover {
  background: var(--accent-hover);
}

.secondary-action {
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-secondary);
}

.secondary-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.secondary-action:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--bg-overlay-soft);
  color: var(--text-primary);
}

.danger-action:hover:not(:disabled) {
  border-color: var(--color-danger);
  background: var(--color-danger-bg-subtle);
  color: var(--color-danger);
}

.density-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.density-option,
.theme-card {
  min-width: 0;
  border: 1px solid var(--border-default);
  background: var(--bg-overlay-soft);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.density-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  text-align: left;
}

.density-option:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.density-option.active {
  border-color: var(--accent-border);
  background: var(--accent-bg-subtle);
  color: var(--text-primary);
}

.density-label {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.density-detail,
.theme-detail {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  line-height: 1.45;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.theme-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  text-align: left;
}

.theme-card:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.theme-card.active {
  border-color: var(--accent-border);
  background: var(--accent-bg-subtle);
  color: var(--text-primary);
}

.theme-swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px var(--bg-overlay-soft);
}

.theme-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.theme-label {
  color: var(--text-primary);
  font-size: 0.86rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-check {
  color: var(--accent);
  font-weight: 700;
  flex-shrink: 0;
}

.field-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.field-control {
  min-width: 0;
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  color: var(--text-tertiary);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  font-size: 0.86rem;
  cursor: not-allowed;
}

.field-hint {
  font-size: 0.76rem;
  margin: 0;
}

.debug-toggle {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  cursor: pointer;
  color: var(--text-primary);
}

.debug-toggle input[type="checkbox"] {
  flex-shrink: 0;
  margin-top: 2px;
  accent-color: var(--accent);
  cursor: pointer;
}

.debug-toggle strong,
.debug-toggle small {
  display: block;
}

.debug-toggle small {
  margin-top: 4px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.log-path-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  border: 1px solid var(--border-subtle);
  background: var(--bg-overlay-soft);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.field-label {
  font-size: 0.74rem;
  color: var(--text-tertiary);
}

.debug-path {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-secondary);
  word-break: break-all;
}

@media (max-width: 900px) {
  .settings-hero {
    align-items: flex-start;
    flex-direction: column;
    padding: 28px 24px 20px;
  }

  .hero-metrics {
    justify-content: flex-start;
  }

  .settings-shell {
    grid-template-columns: 1fr;
  }

  .settings-rail {
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--border-subtle);
    padding: 12px 16px;
  }

  .rail-item {
    flex: 1 0 auto;
  }

  .settings-content {
    padding: 24px;
  }

  .card-grid,
  .card-grid--automation,
  .theme-grid {
    grid-template-columns: 1fr;
  }

  .wide-card {
    grid-column: auto;
  }
}

@media (max-width: 620px) {
  .density-options {
    grid-template-columns: 1fr;
  }

  .button-row,
  .primary-action,
  .secondary-action {
    width: 100%;
  }
}
</style>
