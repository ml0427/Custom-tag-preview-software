<script setup lang="ts">
import AppIcon, { type AppIconName } from './AppIcon.vue';

defineProps<{ active: string | null; hasSource: boolean }>();
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
      <span class="brand-glyph"><AppIcon name="archive" :size="20" /></span>
      <span class="brand-type">CTP</span>
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
          <span v-if="item.id === 'workspace' && hasSource" class="source-status" aria-label="已選擇工作目錄"></span>
        </span>
        <span class="activity-label">{{ item.shortLabel }}</span>
      </button>
    </div>

    <div class="rail-rule" aria-hidden="true"></div>

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
  width: 72px;
  height: 100vh;
  padding: 12px 8px 10px;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  color: var(--content-secondary);
  background:
    linear-gradient(180deg, var(--accent-bg-subtle), transparent 110px),
    var(--surface-panel);
  border-right: 1px solid var(--line-default);
  z-index: 200;
}

.brand-mark {
  width: 52px;
  min-height: 56px;
  padding: 7px 0 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--accent);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md);
  background: var(--accent-bg-subtle);
}

.brand-glyph {
  display: grid;
  place-items: center;
}

.brand-type {
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 500;
  letter-spacing: 0.18em;
  line-height: 1;
}

.rail-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.activity-btn {
  position: relative;
  width: 54px;
  min-height: 52px;
  padding: 6px 2px 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--content-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
}

.activity-btn::before {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: -9px;
  width: 2px;
  background: var(--catalog-spine);
  transform: scaleY(0);
  transform-origin: center;
  transition: transform var(--transition-base);
}

.activity-btn:hover {
  color: var(--content-primary);
  background: var(--surface-hover);
  border-color: var(--line-subtle);
}

.activity-btn.active {
  color: var(--accent);
  background: var(--accent-bg-subtle);
  border-color: var(--accent-border);
}

.activity-btn.active::before {
  transform: scaleY(1);
}

.icon-container {
  position: relative;
  display: grid;
  place-items: center;
}

.source-status {
  position: absolute;
  right: -5px;
  bottom: -3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 0 2px var(--surface-panel);
}

.activity-label {
  font-family: var(--font-jp);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.03em;
  line-height: 1;
  white-space: nowrap;
}

.rail-rule {
  width: 22px;
  height: 1px;
  margin-top: auto;
  background: var(--line-default);
}

.settings-button {
  flex: 0 0 auto;
}

@media (max-width: 959px) {
  .activity-bar {
    width: 64px;
    padding-inline: 5px;
  }

  .activity-btn,
  .brand-mark {
    width: 50px;
  }
}
</style>
