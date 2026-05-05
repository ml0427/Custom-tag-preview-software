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


    <button
      v-for="item in items"
      :key="item.id"
      class="activity-btn"
      :class="{ active: active === item.id }"
      :title="item.label"
      @click="emit('select', item.id)"
    >
      <div class="icon-container">
        <!-- workspace: folder -->
        <svg v-if="item.id === 'workspace'" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
        
        <!-- tags: tag -->
        <svg v-else-if="item.id === 'tags'" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 8.25c-.97 0-1.75-.78-1.75-1.75s.78-1.75 1.75-1.75 1.75.78 1.75 1.75-.78 1.75-1.75 1.75z"/>
        </svg>
        
        <!-- duplicates: layers -->
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>
        </svg>
      </div>
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
  color: var(--text-secondary);
  opacity: 0.8;
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
  opacity: 0.5;
  cursor: not-allowed;
}

.activity-btn.disabled:hover {
  background: transparent;
  color: var(--text-tertiary);
}

.icon-container {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-container svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
  display: block;
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
