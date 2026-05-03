<script setup lang="ts">
import { useThemeStore, type ThemeId } from '../stores/themeStore';

defineProps<{ active: string | null; hasSource: boolean }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();

const items = [
  { id: 'workspace',   icon: '📁', label: '工作目錄', alwaysEnabled: true },
  { id: 'tags',        icon: '🏷️', label: '標籤篩選', alwaysEnabled: false },
  { id: 'duplicates',  icon: '🔁', label: '重複檔案', alwaysEnabled: false },
];

const themeStore = useThemeStore();

const themes: { id: ThemeId; label: string; color: string; ring?: string }[] = [
  { id: 'default', label: 'Default · GitHub Dark',   color: '#2f81f7' },
  { id: 'macos',   label: 'MacOS 晶透',              color: '#007aff' },
  { id: 'vercel',  label: 'Vercel 極簡黑',           color: '#ffffff', ring: '#333' },
  { id: 'neon',    label: 'Neon 霓虹科技',           color: '#00f3ff' },
];
</script>

<template>
  <div class="activity-bar">
    <button
      v-for="item in items"
      :key="item.id"
      class="activity-btn"
      :class="{ active: active === item.id, disabled: !item.alwaysEnabled && !hasSource }"
      :title="!item.alwaysEnabled && !hasSource ? '請先選擇工作目錄' : item.label"
      :disabled="!item.alwaysEnabled && !hasSource"
      @click="emit('select', item.id)"
    >
      <span class="icon">{{ item.icon }}</span>
      <span class="label">{{ item.label }}</span>
    </button>

    <div class="spacer"></div>

    <div class="theme-switcher" role="group" aria-label="切換主題風格">
      <button
        v-for="t in themes"
        :key="t.id"
        class="theme-swatch"
        :class="{ active: themeStore.current === t.id }"
        :style="{ background: t.color, borderColor: t.ring || 'transparent' }"
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
  width: 56px;
  height: 100vh;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
  gap: 16px;
  z-index: 200;
  flex-shrink: 0;
}

.activity-btn {
  width: 40px;
  height: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px 4px;
  transition: background 0.15s, color 0.15s;
  position: relative;
}

.activity-btn::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 3px;
  height: 60%;
  background: var(--accent);
  border-radius: 0 3px 3px 0;
  transition: transform 0.2s;
}

.activity-btn:hover {
  background: var(--bg-overlay-soft);
  color: var(--text-primary);
}

.activity-btn.active {
  color: var(--text-primary);
  background: var(--accent-bg-subtle);
}

.activity-btn.active::before {
  transform: translateY(-50%) scaleY(1);
}


.activity-btn.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.activity-btn.disabled:hover {
  background: transparent;
  color: var(--text-secondary);
}

.icon { font-size: 1.3rem; line-height: 1; }
.label { font-size: 0.6rem; letter-spacing: 0.3px; }

.spacer { flex: 1; min-height: 16px; }

.theme-switcher {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0 4px;
  border-top: 1px solid var(--border-default);
  width: 100%;
}

.theme-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid transparent;
  padding: 0;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.theme-swatch:hover {
  transform: scale(1.2);
}

.theme-swatch.active {
  box-shadow: 0 0 0 2px var(--text-primary);
}
</style>
