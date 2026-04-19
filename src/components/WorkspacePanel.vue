<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { api, type Source } from '../api';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import DirTreeNode from './DirTreeNode.vue';

const props = defineProps<{ selectedPath: string | null }>();
const emit = defineEmits<{
  (e: 'select', path: string | null): void;
  (e: 'folderCreated'): void;
}>();

// 右鍵選單
const ctxMenu = ref({ visible: false, x: 0, y: 0, path: '' });
const showAddFolder = ref(false);
const newFolder = ref({ path: '', name: '', folderType: 'default', note: '' });

const openCtxMenu = (payload: { path: string; x: number; y: number }) => {
  ctxMenu.value = { visible: true, x: payload.x, y: payload.y, path: payload.path };
};

const closeCtxMenu = () => { ctxMenu.value.visible = false; };

const openAddFolderFromCtx = () => {
  const p = ctxMenu.value.path;
  newFolder.value = {
    path: p,
    name: p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p,
    folderType: 'default',
    note: '',
  };
  closeCtxMenu();
  showAddFolder.value = true;
};

const submitAddFolder = async () => {
  const { path, name, folderType, note } = newFolder.value;
  if (!path || !name) return;
  try {
    await api.createFolder(path, name.trim(), folderType, note.trim());
    showAddFolder.value = false;
    emit('folderCreated');
  } catch (e) {
    alert('新增失敗: ' + String(e));
  }
};

onMounted(() => document.addEventListener('click', closeCtxMenu));
onUnmounted(() => document.removeEventListener('click', closeCtxMenu));

const sources = ref<Source[]>([]);
const isSyncing = ref(false);

const loadSources = async () => {
  sources.value = await api.getSources();
  if (props.selectedPath === null && sources.value.length > 0) {
    emit('select', sources.value[0].path);
  }
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
            @contextmenu="openCtxMenu"
          />
          <button
            class="remove-btn"
            :title="`移除 ${src.path}`"
            @click="handleRemoveSource(src, $event)"
          >✕</button>
        </div>
      </div>
    </div>

    <!-- 右鍵選單 -->
    <div
      v-if="ctxMenu.visible"
      class="ctx-menu"
      :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
      @click.stop
    >
      <div class="ctx-item" @click="openAddFolderFromCtx">📌 加入知識庫</div>
    </div>

    <!-- 加入知識庫 Modal -->
    <div v-if="showAddFolder" class="folder-modal-backdrop" @click.self="showAddFolder = false">
      <div class="folder-modal glass-panel">
        <h3>加入知識庫</h3>
        <div class="folder-field">
          <label>路徑</label>
          <span class="path-text">{{ newFolder.path }}</span>
        </div>
        <div class="folder-field">
          <label>名稱</label>
          <input v-model="newFolder.name" class="folder-input" placeholder="顯示名稱" />
        </div>
        <div class="folder-field">
          <label>類型</label>
          <select v-model="newFolder.folderType" class="folder-input">
            <option value="default">📁 一般資料夾</option>
            <option value="comic">📚 漫畫</option>
          </select>
        </div>
        <div class="folder-field">
          <label>備註</label>
          <input v-model="newFolder.note" class="folder-input" placeholder="選填" />
        </div>
        <div class="folder-actions">
          <button class="btn-cancel" @click="showAddFolder = false">取消</button>
          <button class="btn-confirm" @click="submitAddFolder" :disabled="!newFolder.name">確認</button>
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

.ctx-menu {
  position: fixed;
  z-index: 9999;
  background: #1e2230;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 4px 0;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  min-width: 140px;
}

.ctx-item {
  padding: 9px 16px;
  font-size: 0.88rem;
  cursor: pointer;
  color: var(--text-secondary);
  transition: background 0.15s, color 0.15s;
}
.ctx-item:hover { background: rgba(255,255,255,0.07); color: var(--text-primary); }

.folder-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.folder-modal {
  width: 400px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-radius: 14px;
}

.folder-modal h3 { font-size: 1rem; font-weight: 600; margin: 0; }

.folder-field { display: flex; flex-direction: column; gap: 4px; }
.folder-field label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.path-text {
  font-size: 0.8rem;
  color: var(--text-secondary);
  word-break: break-all;
}

.folder-input {
  background: rgba(0,0,0,0.35);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 7px 10px;
  font-size: 0.88rem;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.2s;
  font-family: inherit;
}
.folder-input:focus { border-color: var(--accent-color); }

.folder-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }

.btn-cancel {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text-secondary);
  padding: 7px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.88rem;
}
.btn-cancel:hover { color: var(--text-primary); }

.btn-confirm {
  background: var(--accent-color);
  border: none;
  color: #fff;
  padding: 7px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 500;
  transition: background 0.15s;
}
.btn-confirm:hover:not(:disabled) { background: var(--accent-hover); }
.btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
