<script setup lang="ts">
defineProps<{ active: string | null; hasSource: boolean }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();

const mainItems = [
  { id: 'workspace',  label: '工作目錄' },
  { id: 'tags',       label: '標籤篩選' },
  { id: 'duplicates', label: '重複檔案' },
];

const settingsItem = { id: 'settings', label: '設定' };
</script>

<template>
  <div class="activity-bar">

    <button
      v-for="item in mainItems"
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
        <svg v-else-if="item.id === 'duplicates'" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>
        </svg>
      </div>
    </button>

    <div class="spacer"></div>

    <!-- settings (置底) -->
    <button
      class="activity-btn"
      :class="{ active: active === settingsItem.id }"
      :title="settingsItem.label"
      @click="emit('select', settingsItem.id)"
    >
      <div class="icon-container">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
      </div>
    </button>
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
</style>
