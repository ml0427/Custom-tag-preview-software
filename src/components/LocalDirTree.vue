<script setup lang="ts">
import { type Source } from '../api';
import DirTreeNode from './DirTreeNode.vue';

defineProps<{
  sources: Source[];
  selectedPath: string | null;
}>();

const emit = defineEmits<{
  (e: 'select', path: string): void;
  (e: 'contextmenu', payload: { path: string; x: number; y: number }): void;
  (e: 'removeSource', source: Source, event: MouseEvent): void;
}>();
</script>

<template>
  <div class="tree-area">
    <div v-if="sources.length === 0" class="empty">
      <slot name="empty">
        <p>尚未新增任何目錄</p>
        <p class="hint">點擊下方「新增目錄」開始</p>
      </slot>
    </div>

    <!-- 各來源根目錄（可展開樹狀） -->
    <div v-for="src in sources" :key="src.id" class="source-root">
      <div class="root-header" :class="{ active: selectedPath === src.path }">
        <DirTreeNode
          :path="src.path"
          :label="src.path.split(/[\\/]/).filter(Boolean).pop() ?? src.path"
          :depth="0"
          :selectedPath="selectedPath"
          :isRoot="true"
          @select="emit('select', $event)"
          @contextmenu="emit('contextmenu', $event)"
        />
        <button
          class="remove-btn"
          :title="`移除 ${src.path}`"
          @click="emit('removeSource', src, $event)"
        >✕</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tree-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  text-align: center;
  padding: 40px 16px;
  gap: 6px;
  font-size: 0.85rem;
}

.hint { font-size: 0.75rem; opacity: 0.6; }

.source-root {
  margin-bottom: 2px;
}

.root-header {
  display: flex;
  align-items: flex-start;
  position: relative;
}

.root-header > :first-child {
  flex: 1;
  min-width: 0;
}

.remove-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 0.75rem;
  padding: 6px 4px;
  border-radius: 4px;
  opacity: 0;
  flex-shrink: 0;
  transition: opacity 0.15s, color 0.15s;
  cursor: pointer;
  align-self: center;
}

.root-header:hover .remove-btn { opacity: 0.5; }
.root-header:hover .remove-btn:hover { opacity: 1; color: var(--color-danger); }

.tree-area::-webkit-scrollbar { width: 4px; }
.tree-area::-webkit-scrollbar-thumb {
  background: var(--bg-overlay-strong);
  border-radius: 10px;
}
</style>
