<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api, type Source } from '../api';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import DirTreeNode from './DirTreeNode.vue';

const props = defineProps<{ selectedPath: string | null }>();
const emit = defineEmits<{ (e: 'select', path: string | null): void }>();

const sources = ref<Source[]>([]);
const isSyncing = ref(false);

const loadSources = async () => {
  sources.value = await api.getSources();
};

const handleSelectPath = (path: string) => {
  emit('select', props.selectedPath === path ? null : path);
};

const handleAddSource = async () => {
  const path = await openDialog({ directory: true, multiple: false, title: '新增工作目錄' });
  if (typeof path !== 'string') return;
  try {
    await api.addSource(path);
    await loadSources();
  } catch (e) {
    alert('新增來源失敗: ' + String(e));
  }
};

const handleRemoveSource = async (source: Source, e: MouseEvent) => {
  e.stopPropagation();
  if (!confirm(`確定移除「${source.path}」？\n（不影響已掃描的漫畫資料）`)) return;
  await api.removeSource(source.id);
  if (props.selectedPath?.startsWith(source.path)) emit('select', null);
  await loadSources();
};

const handleSyncSources = async () => {
  if (sources.value.length === 0) { alert('尚未新增任何來源目錄'); return; }
  isSyncing.value = true;
  try {
    const res = await api.syncSources();
    const errMsg = res.errors.length ? `\n\n失敗：${res.errors.join('\n')}` : '';
    alert(`同步完成（${res.sourceCount} 個來源）\n新增 ${res.added}、更新 ${res.updated}、移除 ${res.removed} 本${errMsg}`);
    await loadSources();
    window.location.reload();
  } catch (e) {
    alert('同步失敗: ' + String(e));
  } finally {
    isSyncing.value = false;
  }
};

onMounted(loadSources);
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h2>工作目錄</h2>
    </div>

    <div class="tree-area">
      <!-- 全部目錄 -->
      <div
        class="all-item"
        :class="{ active: selectedPath === null }"
        @click="emit('select', null)"
      >
        <span class="all-icon">🌐</span>
        <span class="all-label">全部目錄</span>
      </div>

      <div v-if="sources.length === 0" class="empty">
        <p>尚未新增任何目錄</p>
        <p class="hint">點擊下方「新增目錄」開始</p>
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
            @select="handleSelectPath"
          />
          <button
            class="remove-btn"
            :title="`移除 ${src.path}`"
            @click="handleRemoveSource(src, $event)"
          >✕</button>
        </div>
      </div>
    </div>

    <div class="panel-footer">
      <button class="btn-add" @click="handleAddSource">＋ 新增目錄</button>
      <button
        class="btn-sync"
        @click="handleSyncSources"
        :disabled="isSyncing || sources.length === 0"
      >
        {{ isSyncing ? '⏳ 同步中...' : '⟳ 同步所有' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  padding: 20px 16px 12px;
  border-bottom: 1px solid var(--panel-border);
  flex-shrink: 0;
}

.panel-header h2 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-secondary);
  font-weight: 600;
}

.tree-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.all-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary);
  transition: background 0.15s;
  margin-bottom: 4px;
}

.all-item:hover { background: rgba(255,255,255,0.06); }
.all-item.active {
  background: var(--tag-bg);
  color: var(--accent-hover);
  border-left: 3px solid var(--accent-color);
  padding-left: 7px;
}

.all-icon { font-size: 1rem; }
.all-label { font-size: 0.88rem; }

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
.root-header:hover .remove-btn:hover { opacity: 1; color: var(--danger-color); }

.panel-footer {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--panel-border);
  flex-shrink: 0;
}

.btn-add, .btn-sync {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 500;
  transition: all 0.15s;
  cursor: pointer;
}

.btn-add {
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--panel-border);
  color: var(--text-primary);
}

.btn-add:hover { background: rgba(255,255,255,0.12); }

.btn-sync {
  background: var(--accent-color);
  border: none;
  color: #fff;
}

.btn-sync:hover:not(:disabled) {
  background: var(--accent-hover);
  box-shadow: 0 4px 12px rgba(47, 129, 247, 0.4);
}

.btn-sync:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.tree-area::-webkit-scrollbar { width: 4px; }
.tree-area::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 10px;
}
</style>
