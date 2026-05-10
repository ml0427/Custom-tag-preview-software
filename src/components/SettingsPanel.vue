<script setup lang="ts">
import { ref } from 'vue';
import { useItemTypes } from '../composables/useItemTypes';
import { useThemeStore, type ThemeId } from '../stores/themeStore';
import { useFontSizeStore, type FontSize } from '../stores/fontSizeStore';
import CategoryManageModal from './CategoryManageModal.vue';

const emit = defineEmits<{ (e: 'categorySaved'): void }>();

const { load: loadItemTypes } = useItemTypes();
const themeStore = useThemeStore();
const fontSizeStore = useFontSizeStore();

const showCategoryManage = ref(false);

const handleCategoryClose = () => {
  showCategoryManage.value = false;
  loadItemTypes(true);
  emit('categorySaved');
};

const fontSizes: { id: FontSize; label: string }[] = [
  { id: 'small',  label: '小' },
  { id: 'medium', label: '中' },
  { id: 'large',  label: '大' },
];

const themes: { id: ThemeId; label: string; color: string }[] = [
  { id: 'obsidian',  label: 'Obsidian · Amber',    color: '#f0b429' },
  { id: 'forge',     label: 'Forge · Industrial',  color: '#ff6b35' },
  { id: 'parchment', label: 'Parchment · Archive', color: '#b0431e' },
  { id: 'phosphor',  label: 'Phosphor · Terminal', color: '#00ff41' },
];
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h2>設定</h2>
    </div>
    <div class="panel-body">

      <section class="section">
        <h3 class="section-title">管理</h3>
        <button class="manage-btn" @click="showCategoryManage = true">
          <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
          管理類別
        </button>
      </section>

      <section class="section">
        <h3 class="section-title">顯示</h3>

        <div class="field">
          <label class="field-label">字型大小</label>
          <div class="seg">
            <button
              v-for="s in fontSizes"
              :key="s.id"
              class="seg-btn"
              :class="{ active: fontSizeStore.current === s.id }"
              @click="fontSizeStore.setFontSize(s.id)"
            >{{ s.label }}</button>
          </div>
        </div>

        <div class="field">
          <label class="field-label">主題風格</label>
          <div class="theme-list">
            <button
              v-for="t in themes"
              :key="t.id"
              class="theme-option"
              :class="{ active: themeStore.current === t.id }"
              @click="themeStore.setTheme(t.id)"
            >
              <span class="theme-swatch" :style="{ background: t.color }"></span>
              <span class="theme-label">{{ t.label }}</span>
              <span v-if="themeStore.current === t.id" class="theme-check">✓</span>
            </button>
          </div>
        </div>
      </section>

      <section class="section">
        <h3 class="section-title">語言</h3>
        <div class="field">
          <select class="lang-select" disabled>
            <option>繁體中文</option>
          </select>
          <span class="hint">i18n 規劃中</span>
        </div>
      </section>

    </div>
  </div>

  <CategoryManageModal :visible="showCategoryManage" @close="handleCategoryClose" />
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.panel-header h2 {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-tertiary);
  font-weight: 500;
}

.panel-body {
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
  font-weight: 500;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

/* 管理類別按鈕 */
.manage-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 500;
  font-family: var(--font-mono);
  background: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
  text-align: left;
}
.manage-btn:hover { background: var(--bg-overlay-soft); color: var(--text-primary); }
.btn-icon { width: 16px; height: 16px; flex-shrink: 0; }

/* segmented 控制 */
.seg {
  display: flex;
  background: var(--bg-overlay-soft);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 2px;
  gap: 2px;
}
.seg-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 0.82rem;
  padding: 5px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.seg-btn:hover { color: var(--text-primary); }
.seg-btn.active {
  background: var(--accent-bg-subtle);
  color: var(--accent);
}

/* 主題清單 */
.theme-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 0.82rem;
  text-align: left;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.theme-option:hover { background: var(--bg-overlay-soft); }
.theme-option.active {
  background: var(--accent-bg-subtle);
  border-color: var(--accent);
}
.theme-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}
.theme-label { flex: 1; }
.theme-check { color: var(--accent); font-size: 0.85rem; flex-shrink: 0; }

/* 語言 placeholder */
.lang-select {
  background: var(--bg-overlay-soft);
  border: 1px solid var(--border-default);
  color: var(--text-tertiary);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.82rem;
  cursor: not-allowed;
}
.hint {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  font-style: italic;
}
</style>
