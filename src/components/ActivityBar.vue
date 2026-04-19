<script setup lang="ts">
defineProps<{ active: string | null; hasSource: boolean }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();

const items = [
  { id: 'workspace', icon: '📁', label: '工作目錄', alwaysEnabled: true },
  { id: 'tags',      icon: '🏷️', label: '標籤篩選', alwaysEnabled: false },
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
  </div>
</template>

<style scoped>
.activity-bar {
  width: 64px;
  height: 100vh;
  background: rgba(13, 17, 23, 0.95);
  border-right: 1px solid var(--panel-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 4px;
  flex-shrink: 0;
}

.activity-btn {
  width: 48px;
  height: 52px;
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
  background: var(--accent-color);
  border-radius: 0 3px 3px 0;
  transition: transform 0.2s;
}

.activity-btn:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text-primary);
}

.activity-btn.active {
  color: var(--text-primary);
  background: rgba(47, 129, 247, 0.12);
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
</style>
