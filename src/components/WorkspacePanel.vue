<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api, type Source } from '../api';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

const props = defineProps<{ selectedPath: string | null }>();
const emit = defineEmits<{ (e: 'select', path: string | null): void }>();

const sources = ref<Source[]>([]);
const isSyncing = ref(false);

const handleSelectSource = (path: string) => {
  emit('select', props.selectedPath === path ? null : path);
};

const loadSources = async () => {
  sources.value = await api.getSources();
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

const handleRemoveSource = async (source: Source) => {
  if (!confirm(`確定移除「${source.path}」？\n（不影響已掃描的漫畫資料）`)) return;
  await api.removeSource(source.id);
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

const formatLastSync = (s: string | null) => {
  if (!s) return '從未同步';
  return new Date(s).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

onMounted(loadSources);
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h2>工作目錄</h2>
    </div>

    <div class="source-list">
      <!-- 全部目錄 -->
      <div
        class="source-card all-card"
        :class="{ active: selectedPath === null }"
        @click="emit('select', null)"
      >
        <div class="source-icon">🌐</div>
        <div class="source-info">
          <div class="source-name">全部目錄</div>
          <div class="source-path">所有已登記來源的聯集</div>
        </div>
      </div>

      <div v-if="sources.length === 0" class="empty">
        <p>尚未新增任何目錄</p>
        <p class="hint">點擊下方「新增目錄」開始</p>
      </div>
      <div
        v-for="src in sources"
        :key="src.id"
        class="source-card"
        :class="{ active: selectedPath === src.path }"
        @click="handleSelectSource(src.path)"
      >
        <div class="source-icon">📂</div>
        <div class="source-info">
          <div class="source-name" :title="src.path">{{ src.path.split(/[\\/]/).pop() }}</div>
          <div class="source-path" :title="src.path">{{ src.path }}</div>
          <div class="source-sync">上次同步：{{ formatLastSync(src.lastSync) }}</div>
        </div>
        <button class="remove-btn" @click.stop="handleRemoveSource(src)" title="移除">✕</button>
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
  padding: 20px 20px 12px;
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

.source-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  text-align: center;
  padding: 40px 20px;
  gap: 6px;
}

.hint { font-size: 0.8rem; opacity: 0.6; }

.source-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  transition: background 0.15s;
}

.source-card { cursor: pointer; }
.source-card:hover { background: rgba(255,255,255,0.07); }
.source-card.active {
  background: var(--tag-bg);
  border-color: var(--accent-color);
  border-left: 3px solid var(--accent-color);
}
.all-card { margin-bottom: 4px; }

.source-icon { font-size: 1.2rem; flex-shrink: 0; }

.source-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.source-name {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-path {
  font-size: 0.72rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-sync {
  font-size: 0.72rem;
  color: var(--text-tertiary);
}

.remove-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 0.8rem;
  padding: 4px 6px;
  border-radius: 4px;
  opacity: 0.5;
  flex-shrink: 0;
  transition: opacity 0.15s, color 0.15s;
}

.remove-btn:hover {
  opacity: 1;
  color: var(--danger-color);
}

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

.source-list::-webkit-scrollbar { width: 4px; }
.source-list::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 10px;
}
</style>
