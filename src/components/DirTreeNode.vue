<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '../api';

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
const hasChildren = ref<boolean | null>(null);

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
      <!-- Chevron arrow -->
      <span
        class="arrow"
        :class="{ expanded, invisible: hasChildren === false }"
        @click.stop="toggle"
      >
        <svg v-if="!loading" viewBox="0 0 24 24">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" class="spin">
          <circle cx="12" cy="12" r="9" stroke-dasharray="28 56"/>
        </svg>
      </span>

      <!-- Folder SVG icon -->
      <span class="node-icon">
        <svg viewBox="0 0 24 24">
          <path d="M3 9a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/>
        </svg>
      </span>

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
  gap: 4px;
  padding: 4px 10px;
  padding-left: calc(10px + var(--depth) * 14px);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
  user-select: none;
  position: relative;
}

.node-row:hover { background: var(--bg-overlay-soft); }

.node-row.active {
  background: var(--accent-bg-subtle);
}

.node-row.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 15%;
  height: 70%;
  width: 2px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}

.node-row.active .node-label { color: var(--accent); }

.node-row.root .node-label {
  font-weight: 500;
  color: var(--text-primary);
}

.arrow {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-tertiary);
  transition: transform var(--transition-fast);
}

.arrow svg {
  width: 11px;
  height: 11px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.arrow.expanded svg { transform: rotate(90deg); }
.arrow.invisible { opacity: 0; pointer-events: none; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.8s linear infinite; }

.node-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  color: var(--accent);
  opacity: 0.65;
}

.node-icon svg {
  width: 11px;
  height: 11px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-jp);
  font-size: 12px;
  color: var(--text-secondary);
}

.children {
  width: 100%;
}

/* used by SourcePanel to insert dividers between source roots */
.tree-sep {
  height: 1px;
  background: var(--border-subtle);
  margin: 6px 10px;
}
</style>
