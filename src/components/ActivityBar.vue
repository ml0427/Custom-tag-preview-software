<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useThemeStore, type ThemeId } from '../stores/themeStore';

defineProps<{ active: string | null; hasSource: boolean }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();

const items = [
  { id: 'workspace',  label: '工作目錄', alwaysEnabled: true },
  { id: 'tags',       label: '標籤篩選', alwaysEnabled: false },
  { id: 'duplicates', label: '重複檔案', alwaysEnabled: false },
];

const themeStore = useThemeStore();

const themes: { id: ThemeId; label: string; color: string }[] = [
  { id: 'obsidian',  label: 'Obsidian · Amber',    color: '#f0b429' },
  { id: 'forge',     label: 'Forge · Industrial',  color: '#ff6b35' },
  { id: 'parchment', label: 'Parchment · Archive', color: '#b0431e' },
  { id: 'phosphor',  label: 'Phosphor · Terminal', color: '#00ff41' },
];

const themePopupOpen = ref(false);
const themeAreaRef = ref<HTMLElement | null>(null);

const currentColor = () => themes.find(t => t.id === themeStore.current)?.color ?? '#f0b429';

const onDocClick = (e: MouseEvent) => {
  if (themePopupOpen.value && themeAreaRef.value && !themeAreaRef.value.contains(e.target as Node)) {
    themePopupOpen.value = false;
  }
};
onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div class="activity-bar">
    <!-- Amber logo block -->
    <div class="app-logo">
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5H12a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"
          stroke="#060609" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <button
      v-for="item in items"
      :key="item.id"
      class="activity-btn"
      :class="{ active: active === item.id, disabled: !item.alwaysEnabled && !hasSource }"
      :title="!item.alwaysEnabled && !hasSource ? '請先選擇工作目錄' : item.label"
      :disabled="!item.alwaysEnabled && !hasSource"
      @click="emit('select', item.id)"
    >
      <!-- workspace: folder -->
      <svg v-if="item.id === 'workspace'" viewBox="0 0 24 24">
        <path d="M3 9a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/>
      </svg>
      <!-- tags: label -->
      <svg v-else-if="item.id === 'tags'" viewBox="0 0 24 24">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <circle cx="7" cy="7" r="1" fill="currentColor"/>
      </svg>
      <!-- duplicates: copy -->
      <svg v-else viewBox="0 0 24 24">
        <rect x="9" y="9" width="13" height="13" rx="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    </button>

    <div class="spacer"></div>

    <div class="theme-area" ref="themeAreaRef">
      <button
        class="theme-toggle-btn"
        :title="'主題：' + (themes.find(t => t.id === themeStore.current)?.label ?? '')"
        @click="themePopupOpen = !themePopupOpen"
      >
        <span class="theme-dot-indicator" :style="{ background: currentColor() }"></span>
      </button>
      <div v-if="themePopupOpen" class="theme-popup">
        <div class="theme-popup-title">主題風格</div>
        <button
          v-for="t in themes"
          :key="t.id"
          class="theme-option"
          :class="{ active: themeStore.current === t.id }"
          @click="themeStore.setTheme(t.id); themePopupOpen = false"
        >
          <span class="theme-swatch" :style="{ background: t.color }"></span>
          <span class="theme-label">{{ t.label }}</span>
          <span v-if="themeStore.current === t.id" class="theme-check">✓</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.activity-bar {
  width: 44px;
  height: 100vh;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 0;
  gap: 2px;
  z-index: 200;
  flex-shrink: 0;
}

.app-logo {
  width: 30px;
  height: 30px;
  background: var(--accent);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  box-shadow: 0 0 16px rgba(240, 178, 41, 0.3);
  flex-shrink: 0;
}

.app-logo svg {
  width: 15px;
  height: 15px;
}

.activity-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
  position: relative;
  flex-shrink: 0;
}

.activity-btn::before {
  content: '';
  position: absolute;
  left: 0;
  top: 22%;
  height: 56%;
  width: 2px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
  transform: scaleY(0);
  transition: transform var(--transition-base);
}

.activity-btn:hover {
  color: var(--text-primary);
  background: var(--bg-overlay-soft);
}

.activity-btn.active {
  color: var(--accent);
  background: var(--accent-bg-subtle);
}

.activity-btn.active::before {
  transform: scaleY(1);
}

.activity-btn.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.activity-btn.disabled:hover {
  background: transparent;
  color: var(--text-tertiary);
}

.activity-btn svg {
  width: 15px;
  height: 15px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.spacer { flex: 1; }

.theme-area {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
  width: 100%;
}

.theme-toggle-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.theme-toggle-btn:hover {
  background: var(--bg-overlay-soft);
  border-color: var(--border-strong);
}

.theme-dot-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.theme-popup {
  position: absolute;
  bottom: 0;
  left: calc(100% + 8px);
  z-index: 9999;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 6px 4px;
  min-width: 200px;
  box-shadow: var(--shadow-popover);
}

.theme-popup-title {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 12px 6px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 0.88rem;
  transition: background 0.15s;
}
.theme-option:hover { background: var(--bg-overlay-soft); }
.theme-option.active { background: var(--accent-bg-subtle); }

.theme-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.theme-label { flex: 1; text-align: left; }

.theme-check {
  color: var(--accent);
  font-size: 0.85rem;
  flex-shrink: 0;
}
</style>
