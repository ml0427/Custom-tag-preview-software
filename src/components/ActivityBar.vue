<script setup lang="ts">
import AppIcon, { type AppIconName } from './AppIcon.vue';
import CtpLogo from './CtpLogo.vue';
import { useThemeStore } from '../stores/themeStore';

const themeStore = useThemeStore();

defineProps<{ active: string | null }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();

const mainItems: Array<{
  id: 'workspace' | 'tags' | 'file-health';
  label: string;
  shortLabel: string;
  icon: AppIconName;
}> = [
  { id: 'workspace', label: '工作目錄', shortLabel: '目錄', icon: 'folder' },
  { id: 'tags', label: '標籤篩選', shortLabel: '標籤', icon: 'tag' },
  { id: 'file-health', label: '檔案健檢', shortLabel: '健檢', icon: 'shield' },
];
</script>

<template>
  <nav class="activity-bar primary-rail" aria-label="主要導覽">
    <div class="brand-mark" aria-label="Custom Tag Preview">
      <CtpLogo />
    </div>

    <div class="rail-group">
      <button
        v-for="item in mainItems"
        :key="item.id"
        class="activity-btn"
        :class="{ active: active === item.id }"
        :title="item.label"
        :aria-current="active === item.id ? 'page' : undefined"
        @click="emit('select', item.id)"
      >
        <span class="icon-container">
          <AppIcon :name="item.icon" :size="19" />
        </span>
        <span class="activity-label">{{ item.shortLabel }}</span>
      </button>
    </div>

    <div class="rail-spacer" aria-hidden="true"></div>

    <button
      class="activity-btn theme-button"
      title="切換下一個主題；可在設定選擇指定配色"
      @click="themeStore.toggleTheme()"
    >
      <AppIcon name="theme" :size="19" />
      <span class="activity-label">主題</span>
    </button>

    <button
      class="activity-btn settings-button"
      :class="{ active: active === 'settings' }"
      title="設定"
      :aria-current="active === 'settings' ? 'page' : undefined"
      @click="emit('select', 'settings')"
    >
      <span class="icon-container"><AppIcon name="settings" :size="19" /></span>
      <span class="activity-label">設定</span>
    </button>
  </nav>
</template>

<style scoped>
.activity-bar {
  width: 68px;
  height: 100vh;
  padding: 14px 6px 10px;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  color: var(--content-secondary);
  background: var(--surface-panel);
  border-right: 1px solid var(--line-default);
  z-index: 200;
}
.brand-mark {
  width: 44px;
  height: 38px;
  margin: 0 0 16px;
  display: grid;
  place-items: center;
  color: var(--content-primary);
}
.rail-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}
.activity-btn {
  width: 54px;
  min-height: 54px;
  padding: 8px 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: var(--content-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}
.activity-btn:hover {
  color: var(--content-primary);
  background: var(--surface-hover);
}
.activity-btn.active {
  color: var(--accent);
  background: var(--accent-bg-subtle);
}
.icon-container { display: grid; place-items: center; }
.activity-label {
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.25;
  white-space: nowrap;
}
.rail-spacer { margin-top: auto; }
.settings-button, .theme-button { flex: 0 0 auto; }
@media (max-width: 959px) {
  .activity-bar { width: 60px; padding-inline: 4px; }
  .activity-btn { width: 50px; }
}
</style>
