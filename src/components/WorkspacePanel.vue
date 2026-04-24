<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide } from 'vue';
import { api, type Source, type Folder, type Tag } from '../api';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import DirTreeNode from './DirTreeNode.vue';
import { useTagManager } from '../composables/useTagManager';
import { useToast } from '../composables/useToast';

const props = defineProps<{ selectedPath: string | null }>();
const emit = defineEmits<{
  (e: 'select', path: string | null): void;
  (e: 'folderCreated'): void;
  (e: 'openScanWizard'): void;
}>();

const { show: showToast, confirm: confirmDialog } = useToast();

// 右鍵選單
const ctxMenu = ref({ visible: false, x: 0, y: 0, path: '' });
const showFolderModal = ref(false);
const modalPhase = ref<'edit' | 'tags'>('edit');
const folderInDb = ref<{ id: number } | null>(null);
const editFolder = ref({ path: '', name: '', folderType: 'default' });
const applyToSubfolders = ref(false);
const allTags = ref<Tag[]>([]);

const {
  localTags, tagInput, suggestions, showSuggestions,
  initTags, onInputChange, submitInput, selectSuggestion,
  removeTagById, hideSuggestions,
} = useTagManager({
  getEntityId: () => folderInDb.value?.id ?? null,
  addTag: api.addTagToFolder,
  removeTag: api.removeTagFromFolder,
});

const openCtxMenu = (payload: { path: string; x: number; y: number }) => {
  ctxMenu.value = { visible: true, x: payload.x, y: payload.y, path: payload.path };
};

const closeCtxMenu = () => { ctxMenu.value.visible = false; };

const openModifyTypeFromCtx = async () => {
  const p = ctxMenu.value.path;
  closeCtxMenu();
  const [all, tags] = await Promise.all([api.getFolders(), api.getTags()]);
  allTags.value = tags;
  const existing = all.find(f => f.path === p);
  if (existing) {
    folderInDb.value = { id: existing.id };
    editFolder.value = { path: p, name: existing.name, folderType: existing.folderType };
    initTags(existing.tags ?? []);
  } else {
    folderInDb.value = null;
    editFolder.value = {
      path: p,
      name: p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p,
      folderType: 'default',
    };
    initTags([]);
  }
  applyToSubfolders.value = false;
  modalPhase.value = 'edit';
  showFolderModal.value = true;
};

const collectAllSubdirs = async (path: string): Promise<string[]> => {
  const result: string[] = [];
  const queue = [path];
  while (queue.length > 0) {
    const current = queue.shift()!;
    try {
      const subs = await api.listSubdirs(current);
      for (const sub of subs) {
        result.push(sub);
        queue.push(sub);
      }
    } catch {}
  }
  return result;
};

const submitFolderModal = async () => {
  const { path, name, folderType } = editFolder.value;
  if (!path || !name) return;
  try {
    let saved: Folder;
    if (folderInDb.value) {
      saved = await api.updateFolder(folderInDb.value.id, name.trim(), folderType, '');
    } else {
      saved = await api.createFolder(path, name.trim(), folderType, '');
    }
    folderInDb.value = { id: saved.id };
    if (applyToSubfolders.value) {
      const currentMap = new Map(dbFolders.value.map(f => [f.path, f]));
      const allSubs = await collectAllSubdirs(path);
      await Promise.all(allSubs.map(subPath => {
        const existing = currentMap.get(subPath);
        const subName = subPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? subPath;
        return existing
          ? api.updateFolder(existing.id, existing.name, folderType, '')
          : api.createFolder(subPath, subName, folderType, '');
      }));
    }
    await loadDbFolders();
    emit('folderCreated');
    modalPhase.value = 'tags';
  } catch (e) {
    showToast('操作失敗: ' + String(e), 'error');
  }
};

onUnmounted(() => document.removeEventListener('click', closeCtxMenu));

const dbFolders = ref<Folder[]>([]);
const folderByPath = computed(() => new Map(dbFolders.value.map(f => [f.path, f])));
provide('folderByPath', folderByPath);

const loadDbFolders = async () => {
  dbFolders.value = await api.getFolders();
};

const sources = ref<Source[]>([]);
const isSyncing = ref(false);

const loadSources = async () => {
  sources.value = await api.getSources();
  if (props.selectedPath === null && sources.value.length > 0) {
    emit('select', sources.value[0].path);
  }
};

// 同時取得 sources 和 folders，寫入同一 tick 避免圖示閃爍
const initWorkspace = async () => {
  const [srcs, folders] = await Promise.all([api.getSources(), api.getFolders()]);
  sources.value = srcs;
  dbFolders.value = folders;
  if (props.selectedPath === null && srcs.length > 0) {
    emit('select', srcs[0].path);
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
    showToast('新增來源失敗: ' + String(e), 'error');
  }
};

const handleRemoveSource = async (source: Source, e: MouseEvent) => {
  e.stopPropagation();
  if (!await confirmDialog(`確定移除「${source.path}」？\n（不影響已掃描的漫畫資料）`)) return;
  await api.removeSource(source.id);
  if (props.selectedPath?.startsWith(source.path)) emit('select', null);
  await loadSources();
};

const handleSyncSources = async () => {
  if (sources.value.length === 0) { showToast('尚未新增任何來源目錄', 'info'); return; }
  isSyncing.value = true;
  try {
    const res = await api.syncSources();
    const errMsg = res.errors.length ? `\n\n失敗：${res.errors.join('\n')}` : '';
    showToast(`同步完成（${res.sourceCount} 個來源）　新增 ${res.added}、更新 ${res.updated}、移除 ${res.removed} 本${errMsg}`, 'success');
    await loadSources();
    emit('folderCreated'); // 通知父元件刷新 gallery，不需重載整頁
  } catch (e) {
    showToast('同步失敗: ' + String(e), 'error');
  } finally {
    isSyncing.value = false;
  }
};

onMounted(() => {
  initWorkspace();
  document.addEventListener('click', closeCtxMenu);
});
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
      <div class="ctx-item" @click="openModifyTypeFromCtx">✏️ 修改類型</div>
    </div>

    <!-- 修改類型 / 加入知識庫 Modal -->
    <div v-if="showFolderModal" class="folder-modal-backdrop" @click.self="showFolderModal = false">
      <div class="folder-modal glass-panel">

        <!-- Phase 1：基本設定 -->
        <template v-if="modalPhase === 'edit'">
          <h3>{{ folderInDb ? '修改類型' : '加入知識庫' }}</h3>
          <div class="folder-field">
            <label>路徑</label>
            <span class="path-text">{{ editFolder.path }}</span>
          </div>
          <div class="folder-field">
            <label>名稱</label>
            <input v-model="editFolder.name" class="folder-input" placeholder="顯示名稱" />
          </div>
          <div class="folder-field">
            <label>類型</label>
            <select v-model="editFolder.folderType" class="folder-input">
              <option value="default">📁 一般資料夾</option>
              <option value="comic">📚 漫畫</option>
            </select>
          </div>
          <label class="apply-sub-check">
            <input type="checkbox" v-model="applyToSubfolders" />
            套用至所有子資料夾
          </label>
          <div class="folder-actions">
            <button class="btn-cancel" @click="showFolderModal = false">取消</button>
            <button class="btn-confirm" @click="submitFolderModal" :disabled="!editFolder.name">
              下一步：設定標籤
            </button>
          </div>
        </template>

        <!-- Phase 2：標籤設定 -->
        <template v-else>
          <h3>設定標籤</h3>
          <span class="path-text">{{ editFolder.path }}</span>

          <!-- 現有標籤 -->
          <div class="tag-chips">
            <span
              v-for="tag in localTags"
              :key="tag.id"
              class="tag-chip"
              @click="removeTagById(tag.id)"
              title="點擊移除"
            >{{ tag.name }} ✕</span>
            <span v-if="localTags.length === 0" class="no-tags">尚無標籤</span>
          </div>

          <!-- 新增標籤輸入 -->
          <div class="tag-input-wrap" @click.stop>
            <input
              v-model="tagInput"
              class="folder-input"
              placeholder="輸入標籤名稱，Enter 新增"
              @input="onInputChange(tagInput, allTags)"
              @keydown.enter.prevent="submitInput(allTags)"
              @keydown.esc="hideSuggestions"
              @blur="hideSuggestions"
            />
            <div v-if="showSuggestions && suggestions.length > 0" class="tag-suggestions">
              <div
                v-for="s in suggestions"
                :key="s.id"
                class="suggestion-item"
                @mousedown.prevent="selectSuggestion(s)"
              >{{ s.name }}</div>
            </div>
          </div>

          <div class="folder-actions">
            <button class="btn-confirm" @click="showFolderModal = false">完成</button>
          </div>
        </template>

      </div>
    </div>

    <div class="panel-footer">
      <button class="btn-add" @click="handleAddSource">＋ 新增目錄</button>
      <button
        class="btn-scan"
        @click="emit('openScanWizard')"
        :disabled="sources.length === 0"
        title="掃描標籤 wizard"
      >
        🏷 掃描標籤
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

.btn-add, .btn-scan {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 500;
  transition: all 0.15s;
  cursor: pointer;
}

.btn-scan {
  background: rgba(34,197,94,0.15);
  border: 1px solid rgba(34,197,94,0.4);
  color: #4ade80;
}
.btn-scan:hover:not(:disabled) { background: rgba(34,197,94,0.25); }
.btn-scan:disabled { opacity: 0.35; cursor: not-allowed; }

.btn-add {
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--panel-border);
  color: var(--text-primary);
}

.btn-add:hover { background: rgba(255,255,255,0.12); }


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

.apply-sub-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  cursor: pointer;
  margin-top: 4px;
  user-select: none;
}
.apply-sub-check input[type="checkbox"] { cursor: pointer; accent-color: var(--accent-color); }

.folder-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 32px;
  align-items: flex-start;
}

.tag-chip {
  background: var(--tag-bg);
  color: var(--accent-hover);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 0.8rem;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.tag-chip:hover { background: rgba(255,80,80,0.2); color: #ff8080; }

.no-tags { font-size: 0.8rem; color: var(--text-secondary); opacity: 0.5; }

.tag-input-wrap { position: relative; }

.tag-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #1e2230;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  z-index: 100;
  max-height: 140px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.suggestion-item {
  padding: 7px 12px;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--text-secondary);
}
.suggestion-item:hover { background: rgba(255,255,255,0.07); color: var(--text-primary); }

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
