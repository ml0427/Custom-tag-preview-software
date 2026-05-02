<script setup lang="ts">
import { ref, computed, inject, watch } from 'vue';
import { api, type Folder } from '../api';
import { useItemTypes } from '../composables/useItemTypes';

const props = defineProps<{
  path: string;
  label: string;
  depth: number;
  selectedPath: string | null;
  isRoot?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', path: string): void;
  (e: 'contextmenu', payload: { path: string; x: number; y: number }): void;
}>();

const expanded = ref(false);
const children = ref<string[]>([]);
const loaded = ref(false);
const loading = ref(false);
const hasChildren = ref<boolean | null>(null); // null = 未知

const folderByPath = inject<{ value: Map<string, Folder> }>('folderByPath', { value: new Map() });
const { getTypeConfig } = useItemTypes();

const nodeIcon = computed(() => {
  if (props.isRoot) return '📂';
  const ft = folderByPath.value.get(props.path)?.category;
  return getTypeConfig(ft).icon;
});

const getLabel = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p;

const toggle = async () => {
  if (!expanded.value) {
    if (!loaded.value) {
      loading.value = true;
      try {
        const raw = await api.listSubdirs(props.path);
        children.value = raw.slice().sort((a, b) =>
          getLabel(a).localeCompare(getLabel(b), 'zh-TW', { sensitivity: 'base' })
        );
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

// Auto-expand when selectedPath is a descendant of this node
watch(() => props.selectedPath, async (newPath) => {
  if (!newPath || expanded.value) return;
  const selfNorm = props.path.replace(/\\/g, '/');
  const newNorm = newPath.replace(/\\/g, '/');
  if (newNorm.startsWith(selfNorm + '/')) {
    await toggle();
  }
}, { immediate: true });

const handleClick = () => {
  emit('select', props.path);
  if (!expanded.value) void toggle();
};

const onContextMenu = (e: MouseEvent) => {
  emit('contextmenu', { path: props.path, x: e.clientX, y: e.clientY });
};

</script>

<template>
  <div class="tree-node" :style="{ '--depth': depth }">
    <div
      class="node-row"
      :class="{ active: selectedPath === path, root: isRoot }"
      @click="handleClick"
      @contextmenu.prevent="onContextMenu"
    >
      <span
        class="arrow"
        :class="{ expanded, invisible: hasChildren === false }"
        @click.stop="toggle"
      >
        {{ loading ? '⏳' : '▶' }}
      </span>
      <span class="node-icon">{{ nodeIcon }}</span>
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
        @contextmenu="(p) => emit('contextmenu', p)"
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
  background: var(--accent-bg-subtle);
  color: var(--accent-hover);
  border-left: 3px solid var(--accent);
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
