<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide } from 'vue';
import { api, type Source, type Folder, type Tag } from '../api';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import LocalDirTree from './LocalDirTree.vue';
import TypeManageModal from './CategoryManageModal.vue';
import { useTagManager } from '../composables/useTagManager';
import { useToast } from '../composables/useToast';
import { useItemTypes } from '../composables/useItemTypes';

const props = defineProps<{ selectedPath: string | null }>();
const emit = defineEmits<{
  (e: 'select', path: string | null): void;
  (e: 'folderCreated'): void;
}>();

const { show: showToast, confirm: confirmDialog } = useToast();
const { itemTypes, load: loadItemTypes } = useItemTypes();
const showTypeManage = ref(false);

// 右鍵選單
const ctxMenu = ref({ visible: false, x: 0, y: 0, path: '' });
const showFolderModal = ref(false);
const modalPhase = ref<'edit' | 'tags'>('edit');
const folderInDb = ref<{ id: number } | null>(null);
const editFolder = ref({ path: '', name: '', category: 'default' });
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

const untrackFromCtx = async () => {
  const p = ctxMenu.value.path;
  closeCtxMenu();
  if (!await confirmDialog(`確定移除「${p.replace(/\\/g, '/').split('/').pop()}」的追蹤記錄？\n（不刪除實際檔案）`)) return;
  try {
    await api.untrackItem(p);
    await loadDbFolders();
    emit('folderCreated');
  } catch (e) {
    showToast('移除追蹤失敗: ' + String(e), 'error');
  }
};

const openModifyTypeFromCtx = async () => {
  const p = ctxMenu.value.path;
  closeCtxMenu();
  const [all, tags] = await Promise.all([api.getFolders(), api.getTags()]);
  allTags.value = tags;
  const existing = all.find(f => f.path === p);
  if (existing) {
    folderInDb.value = { id: existing.id };
    editFolder.value = { path: p, name: existing.name, category: existing.category };
    initTags(existing.tags ?? []);
  } else {
    folderInDb.value = null;
    editFolder.value = {
      path: p,
      name: p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p,
      category: 'default',
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
  const { path, name, category } = editFolder.value;
  if (!path || !name) return;
  try {
    let saved: Folder;
    if (folderInDb.value) {
      saved = await api.updateFolder(folderInDb.value.id, name.trim(), category, '');
    } else {
      saved = await api.createFolder(path, name.trim(), category, '');
    }
    folderInDb.value = { id: saved.id };
    if (applyToSubfolders.value) {
      const currentMap = new Map(dbFolders.value.map(f => [f.path, f]));
      const allSubs = await collectAllSubdirs(path);
      await Promise.all(allSubs.map(subPath => {
        const existing = currentMap.get(subPath);
        const subName = subPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? subPath;
        return existing
          ? api.updateFolder(existing.id, existing.name, category, '')
          : api.createFolder(subPath, subName, category, '');
      }));
    }
    await loadDbFolders();
    emit('folderCreated');

    const selectedType = itemTypes.value.find(t => t.name === category);
    if (selectedType?.tagRules?.length) {
      try {
        const result = await api.applyTagScan(path, selectedType.tagRules);
        if (result.tagged > 0) showToast(`已自動套用 ${result.tagged} 個標籤`, 'success');
      } catch { /* ignore */ }
    }

    modalPhase.value = 'tags';
  } catch (e) {
    showToast('操作失敗: ' + String(e), 'error');
  }
};

const handleReapplyRules = async () => {
  if (sources.value.length === 0) { showToast('尚未新增任何來源目錄', 'info'); return; }
  try {
    const result = await api.reapplyAllCategoryRules();
    showToast(`重新套用完成，共標記 ${result.tagged} 次`, 'success');
    emit('folderCreated');
  } catch (e) {
    showToast('重新套用失敗: ' + String(e), 'error');
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

const loadSources = async () => {
  sources.value = await api.getSources();
  if (props.selectedPath === null && sources.value.length > 0) {
    emit('select', sources.value[0].path);
  }
};

const initWorkspace = async () => {
  const [srcs, folders] = await Promise.all([api.getSources(), api.getFolders()]);
  sources.value = srcs;
  dbFolders.value = folders;
  if (props.selectedPath === null && srcs.length > 0) {
    emit('select', srcs[0].path);
  }
};

const handleSelectPath = (path: string) => {
  emit('select', path);
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
  if (!await confirmDialog(`確定移除「${source.path}」？\n（不影響已匯入的項目資料）`)) return;
  await api.removeSource(source.id);
  if (props.selectedPath?.startsWith(source.path)) emit('select', null);
  await loadSources();
};

onMounted(() => {
  initWorkspace();
  loadItemTypes();
  document.addEventListener('click', closeCtxMenu);
});
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h2>工作目錄</h2>
    </div>

    <LocalDirTree
      :sources="sources"
      :selectedPath="selectedPath"
      @select="handleSelectPath"
      @contextmenu="openCtxMenu"
      @removeSource="handleRemoveSource"
    />

    <!-- 右鍵選單 -->
    <div
      v-if="ctxMenu.visible"
      class="ctx-menu"
      :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
      @click.stop
    >
      <div class="ctx-item" @click="openModifyTypeFromCtx">✏️ 修改類別</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item ctx-danger" @click="untrackFromCtx">🗑 移除追蹤記錄</div>
    </div>

    <!-- 修改類型 / 加入知識庫 Modal -->
    <div v-if="showFolderModal" class="folder-modal-backdrop" @click.self="showFolderModal = false">
      <div class="folder-modal glass-panel">
        <template v-if="modalPhase === 'edit'">
          <h3>{{ folderInDb ? '修改類別' : '加入知識庫' }}</h3>
          <div class="folder-field">
            <label>路徑</label>
            <span class="path-text">{{ editFolder.path }}</span>
          </div>
          <div class="folder-field">
            <label>名稱</label>
            <input v-model="editFolder.name" class="folder-input" placeholder="顯示名稱" />
          </div>
          <div class="folder-field">
            <label>類別</label>
            <select v-model="editFolder.category" class="folder-input">
              <option v-for="t in itemTypes" :key="t.name" :value="t.name">
                {{ t.icon }} {{ t.displayName }}
              </option>
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

        <template v-else>
          <h3>設定標籤</h3>
          <span class="path-text">{{ editFolder.path }}</span>
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
          <div class="tag-input-wrap" @click.stop>
            <input
              v-model="tagInput"
              class="folder-input"
              placeholder="輸入標籤名稱，Enter 新增"
              @input="onInputChange"
              @keydown.enter.prevent="submitInput"
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
      <button class="btn-manage" @click="showTypeManage = true">⚙ 管理類別</button>
      <button class="btn-scan" @click="handleReapplyRules" :disabled="sources.length === 0" title="對所有資料夾重新套用類別規則">
        🔄 重新套用規則
      </button>
    </div>
  </div>

  <TypeManageModal :visible="showTypeManage" @close="showTypeManage = false; loadItemTypes(true)" />
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-header h2 {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-tertiary);
  font-weight: 500;
}

.panel-footer {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-default);
  flex-shrink: 0;
}

.btn-add, .btn-manage, .btn-scan {
  width: 100%;
  padding: 7px 10px;
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  font-weight: 500;
  font-family: var(--font-mono);
  transition: background var(--transition-fast), color var(--transition-fast);
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--border-default);
}

.btn-scan {
  color: var(--color-success);
  border-color: var(--color-success);
}
.btn-scan:disabled { opacity: 0.3; cursor: not-allowed; }
.btn-scan:hover:not(:disabled) { background: var(--bg-overlay-soft); }

.btn-add {
  color: var(--text-secondary);
}
.btn-add:hover { background: var(--bg-overlay-soft); color: var(--text-primary); }

.btn-manage {
  color: var(--text-tertiary);
}
.btn-manage:hover { background: var(--bg-overlay-soft); color: var(--text-secondary); }

.ctx-menu {
  position: fixed;
  z-index: 9999;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 4px 0;
  box-shadow: var(--shadow-popover);
  min-width: 140px;
}

.ctx-item {
  padding: 9px 16px;
  font-size: 0.88rem;
  cursor: pointer;
  color: var(--text-secondary);
  transition: background 0.15s, color 0.15s;
}
.ctx-item:hover { background: var(--bg-overlay-soft); color: var(--text-primary); }
.ctx-divider { height: 1px; background: var(--border-default); margin: 3px 0; }
.ctx-danger { color: var(--color-danger); }
.ctx-danger:hover { background: var(--color-danger-bg-subtle) !important; color: var(--color-danger) !important; }

.folder-modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--bg-scrim);
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
  background: var(--bg-input);
  border: 1px solid var(--border-default);
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
.folder-input:focus { border-color: var(--accent); }

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
.apply-sub-check input[type="checkbox"] { cursor: pointer; accent-color: var(--accent); }

.folder-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 32px;
  align-items: flex-start;
}

.tag-chip {
  background: var(--accent-bg-subtle);
  color: var(--accent-hover);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 0.8rem;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.tag-chip:hover { background: var(--color-danger-bg-subtle); color: var(--color-danger); }

.no-tags { font-size: 0.8rem; color: var(--text-secondary); opacity: 0.5; }

.tag-input-wrap { position: relative; }

.tag-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  z-index: 100;
  max-height: 140px;
  overflow-y: auto;
  box-shadow: var(--shadow-popover);
}

.suggestion-item {
  padding: 7px 12px;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--text-secondary);
}
.suggestion-item:hover { background: var(--bg-overlay-soft); color: var(--text-primary); }

.btn-cancel {
  background: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  padding: 7px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.88rem;
}
.btn-cancel:hover { color: var(--text-primary); }

.btn-confirm {
  background: var(--accent);
  border: none;
  color: var(--text-on-accent);
  padding: 7px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 500;
  transition: background 0.15s;
}
.btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-confirm:hover:not(:disabled) { background: var(--accent-hover); }
</style>
