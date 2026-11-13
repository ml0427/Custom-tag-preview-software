<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { api, type ItemType } from '../api';
import { useCategoryManage } from '../composables/useCategoryManage';
import { useThemeStore, type ThemeId } from '../stores/themeStore';
import { FONT_SIZE_PX, useFontSizeStore, type FontSize } from '../stores/fontSizeStore';
import { useToast } from '../composables/useToast';
import { useTags } from '../composables/useTags';
import CategoryEditor from './CategoryEditor.vue';
import { useAppUpdater } from '../composables/useAppUpdater';

const {
  currentVersion, availableVersion, autoCheck, status: updateStatus,
  statusText: updateStatusText, errorMessage: updateError, busy: updateBusy,
  checkForUpdates, setAutoCheck, showUpdate,
} = useAppUpdater();

const props = defineProps<{ initialRuleName?: string }>();
const emit = defineEmits<{
  (e: 'categorySaved'): void;
  (e: 'tagsChanged'): void;
  (e: 'ruleSelected', name: string): void;
}>();

type SettingsSectionId = 'rules' | 'appearance' | 'updates' | 'maintenance' | 'diagnostics';

const {
  itemTypes, load: loadItemTypes, selected, isNew, saving, form, extInput,
  selectType, selectFirst, startNew, addRule, removeRule, addExt, removeExt, save, deleteType,
} = useCategoryManage();
const themeStore = useThemeStore();
const fontSizeStore = useFontSizeStore();
const { show: showToast, confirm: confirmDialog } = useToast();
const { loadTags } = useTags();

const activeSection = ref<SettingsSectionId>('rules');
const rulesReady = ref(false);
const rulesLoadError = ref('');

const selectRuleSet = (type: ItemType) => {
  if (isNew.value || selected.value?.id !== type.id) selectType(type);
  activeSection.value = 'rules';
  emit('ruleSelected', type.name);
};
const createRuleSet = () => {
  if (!isNew.value) startNew();
  activeSection.value = 'rules';
};
const saveRuleSet = async () => {
  if (await save()) {
    emit('categorySaved');
    if (selected.value) emit('ruleSelected', selected.value.name);
  }
};
const deleteRuleSet = async () => {
  if (!selected.value || saving.value) return;
  const previousId = selected.value.id;
  await deleteType(selected.value);
  if (!itemTypes.value.some(type => type.id === previousId)) {
    emit('categorySaved');
    if (selected.value) emit('ruleSelected', selected.value.name);
  }
};

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
    await loadItemTypes();
    const initial = itemTypes.value.find(type => type.name === props.initialRuleName)
      ?? itemTypes.value.find(type => type.name === 'comic');
    if (initial) {
      selectType(initial);
      emit('ruleSelected', initial.name);
    }
    else selectFirst();
    rulesReady.value = true;
  } catch (e) {
    rulesLoadError.value = `無法讀取標籤規則：${String(e)}`;
  }
  try {
    const [nextDebugMode, nextDebugLogPath] = await Promise.all([
      api.getDebugMode(),
      api.getDebugLogPath(),
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
  { id: 'light', label: 'Light · 清爽', detail: '淺色畫布，適合長時間整理', color: '#315fc7' },
  { id: 'dark', label: 'Dark · 深色', detail: '深色畫布，降低環境光干擾', color: '#a5beff' },
  { id: 'obsidian', label: 'Obsidian · 琥珀', detail: '原有配色：深黑與琥珀金', color: '#d8a646' },
  { id: 'forge', label: 'Forge · 工業橘', detail: '原有配色：深灰與亮橘', color: '#ff6b35' },
  { id: 'parchment', label: 'Parchment · 暖紙色', detail: '原有配色：米色與磚紅', color: '#b0431e' },
  { id: 'phosphor', label: 'Phosphor · 螢光綠', detail: '原有配色：黑底與終端機綠', color: '#00ff41' },
];

const settingsSections: { id: SettingsSectionId; label: string; title: string; description: string }[] = [
  {
    id: 'appearance',
    label: '外觀',
    title: '外觀與閱讀密度',
    description: '調整字型大小與主題，讓資料整理介面符合你的工作距離。',
  },
  {
    id: 'updates', label: '程式更新', title: '程式更新',
    description: '檢查新版本，設定是否在啟動時通知。',
  },
  {
    id: 'maintenance', label: '資料清理', title: '資料清理',
    description: '整理沒有使用的標籤。',
  },
  {
    id: 'diagnostics', label: '診斷日誌', title: '診斷日誌',
    description: '查看與管理除錯日誌。介面語言：繁體中文。',
  },
];

const currentSection = computed(() => settingsSections.find(section => section.id === activeSection.value) ?? settingsSections[0]);
</script>

<template>
  <div class="settings-panel page-shell">
    <header class="settings-header">
      <h1 class="page-title">設定</h1>
    </header>

    <div class="settings-shell">
      <nav class="settings-rail" aria-label="設定分類">
        <span class="nav-group-label">標籤規則</span>
        <button
          v-for="type in itemTypes"
          :key="type.id"
          type="button"
          class="rail-item rule-nav-item"
          :class="{ active: activeSection === 'rules' && !isNew && selected?.id === type.id }"
          :aria-current="activeSection === 'rules' && !isNew && selected?.id === type.id ? 'page' : undefined"
          :disabled="saving"
          @click="selectRuleSet(type)"
        >
          <span class="rule-nav-icon" :style="{ color: type.color ?? undefined }">{{ type.icon }}</span>
          <span class="rule-nav-name">{{ type.displayName }}</span>
          <span class="rule-nav-count">{{ type.tagRules.length }}</span>
        </button>
        <button type="button" class="rail-item add-rule-set" :class="{ active: activeSection === 'rules' && isNew }" :disabled="saving" @click="createRuleSet">
          ＋ 新增規則集
        </button>
        <span class="nav-group-label program-group">程式設定</span>
        <button
          v-for="section in settingsSections"
          :key="section.id"
          type="button"
          class="rail-item"
          :class="{ active: activeSection === section.id }"
          :aria-current="activeSection === section.id ? 'page' : undefined"
          @click="activeSection = section.id"
        >
          {{ section.label }}
        </button>
      </nav>

      <main class="settings-content">
        <div v-if="activeSection !== 'rules'" class="section-intro">
          <h3>{{ currentSection.title }}</h3>
          <p>{{ currentSection.description }}</p>
        </div>

        <section v-show="activeSection === 'rules'" class="rule-settings" aria-label="標籤規則編輯">
          <p v-if="rulesLoadError" role="alert">{{ rulesLoadError }}</p>
          <p v-else-if="!rulesReady" role="status">載入標籤規則中…</p>
          <CategoryEditor
            v-else
            :key="isNew ? 'new' : selected?.name"
            :isNew="isNew"
            :saving="saving"
            :form="form"
            v-model:extInput="extInput"
            @addExt="addExt"
            @removeExt="removeExt"
            @addRule="addRule"
            @removeRule="removeRule"
            @save="saveRuleSet"
          />
          <button v-if="selected && !selected.isBuiltin && !isNew" type="button" class="secondary-action danger-action delete-rule-set" :disabled="saving" @click="deleteRuleSet">
            刪除「{{ selected.displayName }}」規則集
          </button>
        </section>

        <section v-if="activeSection === 'appearance'" class="card-grid">
          <article class="settings-card">
            <div class="card-header">
              <div>
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
                :aria-pressed="fontSizeStore.current === size.id"
                @click="fontSizeStore.setFontSize(size.id)"
              >
                <span class="density-heading">
                  <span class="density-label">{{ size.label }}</span>
                  <span class="density-pixels">{{ FONT_SIZE_PX[size.id] }}</span>
                </span>
                <span class="density-sample" :style="{ fontSize: FONT_SIZE_PX[size.id] }">漫畫標籤 Aa</span>
                <span class="density-detail">{{ size.detail }}</span>
              </button>
            </div>
          </article>

          <article class="settings-card">
            <div class="card-header">
              <div>
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
                :aria-pressed="themeStore.current === theme.id"
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

        <section v-else-if="activeSection === 'updates'" class="card-grid">
          <article class="settings-card">
            <div class="card-header">
              <div>
                <h4>自動更新</h4>
              </div>
              <span v-if="currentVersion" class="status-pill">v{{ currentVersion }}</span>
            </div>
            <label class="debug-toggle">
              <input type="checkbox" :checked="autoCheck" @change="setAutoCheck(($event.target as HTMLInputElement).checked)" />
              <span>
                <strong>啟動時檢查更新</strong>
                <small>有新版時通知，確認後自動下載、安裝並重新開啟。</small>
              </span>
            </label>
            <p class="card-copy" role="status" aria-live="polite">{{ updateStatusText }}</p>
            <p v-if="updateError" class="card-copy" role="alert">{{ updateError }}</p>
            <div class="button-row">
              <button type="button" class="secondary-action" :disabled="updateBusy || updateStatus === 'unsupported' || updateStatus === 'restart-required'" @click="checkForUpdates()">
                {{ updateStatus === 'checking' ? '檢查中…' : '檢查更新' }}
              </button>
              <button v-if="availableVersion" type="button" class="primary-action" :disabled="updateBusy" @click="showUpdate">
                {{ updateStatus === 'restart-required' ? '重新開啟程式' : `查看 v${availableVersion} 更新` }}
              </button>
            </div>
          </article>
        </section>
        <section v-else-if="activeSection === 'maintenance'" class="card-grid">
          <article class="settings-card">
            <h4>清理空標籤</h4>
            <p class="card-copy">移除沒有連到任何檔案或資料夾的標籤。</p>
            <button type="button" class="secondary-action danger-action" :disabled="isDeletingEmptyTags" @click="handleDeleteEmptyTags">
              {{ isDeletingEmptyTags ? '刪除中...' : '刪除空標籤' }}
            </button>
          </article>
        </section>
        <section v-else-if="activeSection === 'diagnostics'" class="card-grid">
          <article class="settings-card">
            <div class="card-header">
              <div>
                <h4>Debug 模式</h4>
              </div>
              <span class="status-pill" :class="{ active: debugMode }">{{ debugMode ? '已開啟' : '已關閉' }}</span>
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

</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.settings-header {
  flex-shrink: 0;
  padding: 16px 24px;
  border-bottom: 1px solid var(--line-default);
}

.page-title {
  margin: 3px 0 2px;
  color: var(--content-primary);
  font-family: var(--font-sans);
  font-size: 21px;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.page-copy {
  margin-top: 6px;
  color: var(--content-secondary);
  font-size: 0.78rem;
  line-height: 1.5;
}

.settings-shell {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.settings-rail {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 3px;
  width: clamp(148px, 18vw, 220px);
  padding: 18px 12px;
  border-right: 1px solid var(--line-default);
  overflow-y: auto;
}

.rail-item {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
  min-height: 42px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-left: 2px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-secondary);
  font-size: 0.82rem;
  font-weight: 500;
  text-align: left;
}

.rail-item:hover { color: var(--content-primary); background: var(--surface-hover); }
.rail-item.active { border-left-color: var(--accent); color: var(--accent); background: var(--accent-bg-subtle); font-weight: 600; }
.rail-item:disabled { opacity: 0.45; cursor: wait; }
.rail-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.nav-group-label { padding: 0 12px 8px; color: var(--content-muted); font-size: 0.73rem; }
.program-group { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--line-default); }
.rule-nav-icon { flex-shrink: 0; width: 20px; text-align: center; }
.rule-nav-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.rule-nav-count { color: var(--content-muted); font-size: 0.72rem; font-weight: 400; }
.add-rule-set { font-size: 0.76rem; }
.rule-settings { max-width: 920px; }
.rule-settings :deep(.type-form) { overflow: visible; padding: 0; }
.delete-rule-set { margin-top: 24px; }

.settings-content {
  flex: 1;
  min-height: 0;
  min-width: 0;
  padding: 20px 24px 32px;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.section-intro,
.card-grid { max-width: 920px; }
.section-intro { margin-bottom: 16px; }
.section-intro h3 { margin: 0; font-size: 1rem; font-weight: 600; }
.section-intro p { margin-top: 4px; font-size: 0.8rem; }

.section-intro p,
.card-copy,
.field-hint { color: var(--content-secondary); line-height: 1.6; }

.card-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.settings-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 18px 20px;
  border: 1px solid var(--line-default);
  border-radius: var(--radius-md);
  background: var(--surface-panel);
}

.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
.card-header > div,
.theme-copy,
.debug-toggle span { min-width: 0; }
.settings-card h4 { margin: 0; color: var(--content-primary); font-size: 0.9rem; font-weight: 600; }
.card-copy { margin: 0; font-size: 0.8rem; }

.card-count,
.status-pill {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-hover);
  color: var(--content-secondary);
  font-size: 0.72rem;
  white-space: nowrap;
}
.status-pill.active { background: var(--accent-bg-subtle); color: var(--accent); }
.stat-row,
.button-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.stat-row { gap: 16px; color: var(--content-secondary); font-size: 0.76rem; }
.stat-row strong { color: var(--content-primary); font-weight: 600; }

.settings-card > button { align-self: flex-start; }
.primary-action,
.secondary-action {
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid var(--line-default);
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.4;
}
.primary-action { border-color: var(--accent); background: var(--accent); color: var(--text-on-accent); }
.secondary-action { background: var(--surface-panel); color: var(--content-primary); }
.primary-action:disabled,
.secondary-action:disabled { opacity: 0.45; cursor: not-allowed; }
.primary-action:hover:not(:disabled) { background: var(--accent-hover); }
.secondary-action:hover:not(:disabled) { border-color: var(--line-strong); background: var(--surface-hover); }
.danger-action { color: var(--color-danger); }
.danger-action:hover:not(:disabled) { border-color: var(--color-danger); background: var(--color-danger-bg-subtle); }

.density-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.density-option,
.theme-card {
  min-width: 0;
  border: 1px solid var(--line-default);
  border-radius: var(--radius-md);
  background: var(--surface-panel);
  color: var(--content-secondary);
  text-align: left;
}
.density-option { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.theme-card { display: flex; align-items: center; gap: 10px; padding: 12px; }
.density-option:hover,
.theme-card:hover { border-color: var(--line-strong); }
.density-option.active,
.theme-card.active { border-color: var(--accent-border); background: var(--accent-bg-subtle); }
.density-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; width: 100%; }
.density-label { color: var(--content-primary); font-size: 0.8rem; font-weight: 600; }
.density-pixels { color: var(--content-muted); font-size: 0.7rem; }
.density-sample { display: block; min-height: 29px; color: var(--content-primary); line-height: 1.6; }
.density-detail,
.theme-detail { color: var(--content-secondary); font-size: 0.73rem; line-height: 1.5; }
.theme-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.theme-swatch { width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%; }
.theme-copy { display: flex; flex-direction: column; flex: 1; gap: 3px; }
.theme-label { color: var(--content-primary); font-size: 0.8rem; font-weight: 600; overflow-wrap: anywhere; }
.theme-check { flex-shrink: 0; color: var(--accent); font-weight: 700; }

.field-stack { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field-control {
  width: min(220px, 100%);
  min-height: 34px;
  padding: 7px 10px;
  border: 1px solid var(--line-default);
  border-radius: var(--radius-md);
  background: var(--surface-input);
  color: var(--content-secondary);
  font-size: 0.8rem;
}
.field-hint { font-size: 0.75rem; }
.debug-toggle { display: flex; align-items: flex-start; gap: 10px; min-width: 0; color: var(--content-primary); cursor: pointer; }
.debug-toggle input[type="checkbox"] { flex-shrink: 0; width: 16px; height: 16px; margin-top: 2px; accent-color: var(--accent); cursor: pointer; }
.debug-toggle strong { display: block; font-size: 0.8rem; font-weight: 500; }
.debug-toggle small { display: block; margin-top: 3px; color: var(--content-secondary); font-size: 0.75rem; line-height: 1.5; }
.log-path-card { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--surface-hover); }
.field-label { color: var(--content-muted); font-size: 0.72rem; }
.debug-path { min-width: 0; color: var(--content-secondary); font-family: var(--font-mono); font-size: 0.72rem; overflow-wrap: anywhere; }

@media (max-width: 600px) {
  .settings-rail { padding: 14px 6px; }
  .settings-content { padding: 16px 12px 24px; }
  .settings-card { padding: 16px; }
  .theme-grid { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 420px) {
  .density-options { grid-template-columns: minmax(0, 1fr); }
}
</style>
