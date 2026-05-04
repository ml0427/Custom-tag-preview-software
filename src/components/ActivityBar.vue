<script setup lang="ts">
import { useThemeStore, type ThemeId } from '../stores/themeStore';

defineProps<{ active: string | null; hasSource: boolean }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();

const items = [
  { id: 'workspace',  label: '工作目錄', alwaysEnabled: true },
  { id: 'tags',       label: '標籤篩選', alwaysEnabled: false },
  { id: 'duplicates', label: '重複檔案', alwaysEnabled: false },
];

const themeStore = useThemeStore();

const themes: { id: ThemeId; label: string; color: string; ring?: string }[] = [
  { id: 'obsidian',  label: 'Obsidian · Amber',    color: '#f0b429' },
  { id: 'forge',     label: 'Forge · Industrial',  color: '#ff6b35' },
  { id: 'parchment', label: 'Parchment · Archive', color: '#b0431e', ring: '#8c6a55' },
  { id: 'phosphor',  label: 'Phosphor · Terminal', color: '#00ff41', ring: '#1a3820' },
];

function dotStyle(t: typeof themes[0], isActive: boolean) {
  const style: Record<string, string> = { background: t.color };
  if (t.ring) style.border = `1px solid ${t.ring}`;
  if (isActive) style.boxShadow = `0 0 0 2px var(--bg-panel), 0 0 0 3.5px ${t.color}`;
  return style;
}
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

    <div class="theme-dots" role="group" aria-label="切換主題風格">
      <button
        v-for="t in themes"
        :key="t.id"
        class="theme-dot"
        :class="{ active: themeStore.current === t.id }"
        :style="dotStyle(t, themeStore.current === t.id)"
        :title="t.label"
        :aria-label="`套用 ${t.label} 主題`"
        :aria-pressed="themeStore.current === t.id"
        @click="themeStore.setTheme(t.id)"
      ></button>
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

.theme-dots {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  width: 100%;
}

.theme-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  flex-shrink: 0;
}

.theme-dot:hover {
  transform: scale(1.25);
}
</style>
