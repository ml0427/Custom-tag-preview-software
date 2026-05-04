<script setup lang="ts">
import { type Tag } from '../api';

defineProps<{
  tag: Tag;
}>();

const emit = defineEmits<{
  (e: 'select', color: string | null): void;
}>();

const COLOR_PRESETS = [
  null,
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#a855f7', '#ec4899', '#6b7280',
];
</script>

<template>
  <div class="color-picker" @click.stop>
    <span
      v-for="c in COLOR_PRESETS"
      :key="c ?? 'none'"
      class="color-swatch"
      :class="{ active: tag.color === c, 'swatch-none': c === null }"
      :style="c ? { background: c } : {}"
      :title="c ?? '預設'"
      @click="emit('select', c)"
    ></span>
  </div>
</template>

<style scoped>
.color-picker {
  position: absolute;
  left: 8px;
  top: calc(100% + 4px);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  width: 144px;
  z-index: 200;
  box-shadow: var(--shadow-popover);
}

.color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.12s, border-color 0.12s;
}
.color-swatch:hover { transform: scale(1.2); }
.color-swatch.active { border-color: var(--text-on-accent); }

.swatch-none {
  background: rgba(255,255,255,0.15);
  border: 2px dashed rgba(255,255,255,0.3);
  position: relative;
}
.swatch-none::after {
  content: '✕';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  color: rgba(255,255,255,0.5);
}
</style>
