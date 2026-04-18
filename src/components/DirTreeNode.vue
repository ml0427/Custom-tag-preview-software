<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../api';

const props = defineProps<{
  path: string;
  label: string;
  depth: number;
  selectedPath: string | null;
  isRoot?: boolean;
}>();

const emit = defineEmits<{ (e: 'select', path: string): void }>();

const expanded = ref(false);
const children = ref<string[]>([]);
const loaded = ref(false);
const loading = ref(false);
const hasChildren = ref<boolean | null>(null); // null = 未知

const getLabel = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p;

const toggle = async () => {
  if (!expanded.value) {
    if (!loaded.value) {
      loading.value = true;
      try {
        children.value = await api.listSubdirs(props.path);
        hasChildren.value = children.value.length > 0;
      } catch {
        hasChildren.value = false;
      } finally {
        loading.value = false;
        loaded.value = true;
      }
    }
    expanded.value = true;
  } else {
    expanded.value = false;
  }
};

const handleClick = () => {
  emit('select', props.path);
};

// 初始化：偷偷探測是否有子目錄（只做一次，不展開）
const probe = async () => {
  if (hasChildren.value !== null) return;
  try {
    const subs = await api.listSubdirs(props.path);
    children.value = subs;
    hasChildren.value = subs.length > 0;
    loaded.value = true;
  } catch {
    hasChildren.value = false;
  }
};
probe();
</script>

<template>
  <div class="tree-node" :style="{ '--depth': depth }">
    <div
      class="node-row"
      :class="{ active: selectedPath === path, root: isRoot }"
      @click="handleClick"
    >
      <span
        class="arrow"
        :class="{ expanded, invisible: hasChildren === false }"
        @click.stop="toggle"
      >
        {{ loading ? '⏳' : '▶' }}
      </span>
      <span class="node-icon">{{ isRoot ? '📂' : '📁' }}</span>
      <span class="node-label" :title="path">{{ label }}</span>
    </div>

    <div v-if="expanded && children.length > 0" class="children">
      <DirTreeNode
        v-for="child in children"
        :key="child"
        :path="child"
        :label="getLabel(child)"
        :depth="depth + 1"
        :selectedPath="selectedPath"
        @select="(p) => emit('select', p)"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node {
  width: 100%;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  padding-left: calc(8px + var(--depth) * 14px);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-secondary);
  transition: background 0.15s;
  user-select: none;
}

.node-row:hover { background: rgba(255,255,255,0.06); }

.node-row.active {
  background: var(--tag-bg);
  color: var(--accent-hover);
  border-left: 3px solid var(--accent-color);
  padding-left: calc(5px + var(--depth) * 14px);
}

.node-row.root {
  font-weight: 500;
  color: var(--text-primary);
}

.arrow {
  width: 14px;
  font-size: 0.6rem;
  flex-shrink: 0;
  text-align: center;
  transition: transform 0.15s;
  cursor: pointer;
  opacity: 0.6;
}

.arrow.expanded { transform: rotate(90deg); }
.arrow.invisible { opacity: 0; pointer-events: none; }

.node-icon { font-size: 0.9rem; flex-shrink: 0; }

.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.children {
  width: 100%;
}
</style>
