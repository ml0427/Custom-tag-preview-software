<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide } from 'vue';
import { api, type Source, type Tag, type Item, type FileItem } from '../api';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import LocalDirTree from './LocalDirTree.vue';
import { useTagManager } from '../composables/useTagManager';
import { useToast } from '../composables/useToast';
import { useItemTypes } from '../composables/useItemTypes';
import { useFolderRuleActions } from '../composables/useFolderRuleActions';

const props = defineProps<{ selectedPath: string | null }>();
const emit = defineEmits<{
  (e: 'select', path: string | null): void;
  (e: 'folderCreated'): void;
}>();

const { show: showToast, confirm: confirmDialog } = useToast();
const { itemTypes, load: loadItemTypes, getTypeConfig } = useItemTypes();
// 右鍵選單
const ctxMenu = ref({ visible: false, x: 0, y: 0, path: '' });
const showFolderModal = ref(false);
const modalPhase = ref<'edit' | 'tags'>('edit');
const folderInDb = ref<{ id: number } | null>(null);
const editFolder = ref({ path: '', name: '', category: 'default' });
const applyToSubfolders = ref(false);
const applyToSubfiles = ref(false);
const isSavingFolder = ref(false);
const progressDone = ref(0);
const progressTotal = ref(0);
const progressLabel = ref('');
const allTags = ref<Tag[]>([]);

const progressPercent = computed(() => {
  if (progressTotal.value <= 0) return 0;
  return Math.min(100, Math.round((progressDone.value / progressTotal.value) * 100));
});

const {
  localTags, tagInput, suggestions, showSuggestions,
  initTags, onInputChange, submitInput, selectSuggestion,
  removeTagById, hideSuggestions,
} = useTagManager({
  getEntityId: () => folderInDb.value?.id ?? null,
  addTag: api.tagItem,
  removeTag: api.untagItem,
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
  await loadDbFolders();
  allTags.value = await api.getTags();
  const existing = dbFolders.value.find(f => f.path === p);
  if (existing) {
    folderInDb.value = { id: existing.id };
    editFolder.value = { path: p, name: existing.name, category: existing.category ?? 'default' };
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
  applyToSubfiles.value = false;
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

/// 確保某個路徑在 DB 有 row，並設定它的顯示名稱與類別。
/// 對「主路徑」我們會用使用者填的 name；對自動帶入的子目錄則沿用 file_name。
const saveFolderCategory = async (
  path: string,
  displayName: string,
  category: string,
): Promise<Item> => {
  const item = await api.quickImportItem(path);
  if (item.name !== displayName) {
    await api.setItemDisplayName(item.id, displayName);
  }
  if ((item.category ?? 'default') !== category) {
    await api.setItemCategory(item.id, category);
  }
  return { ...item, name: displayName, category };
};

const getFolderDisplayName = (path: string): string => (
  path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path
);

const applySubfolderCategories = async (
  subdirs: string[],
  category: string,
): Promise<Item[]> => {
  if (!applyToSubfolders.value) return [];

  const result: Item[] = [];
  for (const subPath of subdirs) {
    progressLabel.value = `套用子資料夾：${getFolderDisplayName(subPath)}`;
    result.push(await saveFolderCategory(subPath, getFolderDisplayName(subPath), category));
    progressDone.value += 1;
  }
  return result;
};

const collectAllSubfiles = async (parentPath: string, subdirs: string[]): Promise<FileItem[]> => {
  const scanTargets = [parentPath, ...subdirs];
  const result: FileItem[] = [];

  for (const dirPath of scanTargets) {
    try {
      const children = await api.listDirFiles(dirPath);
      result.push(...children.filter(child => !child.isDir));
    } catch {}
  }

  return result;
};

const applySubfileCategories = async (
  subfiles: FileItem[],
  category: string,
): Promise<Item[]> => {
  if (!applyToSubfiles.value) return [];

  const result: Item[] = [];
  for (const file of subfiles) {
    progressLabel.value = `套用子檔案：${file.name}`;
    result.push(await saveFolderCategory(file.path, file.name, category));
    progressDone.value += 1;
  }
  return result;
};

const refreshFolderState = async () => {
  await loadDbFolders();
  emit('folderCreated');
};

const runRulesForCategory = async (targets: Item[], selectedType: ReturnType<typeof getTypeConfig>) => {
  if (!selectedType.tagRules?.length) return;

  try {
    let totalTagged = 0;
    for (const target of targets) {
      progressLabel.value = `套用標籤規則：${target.name}`;
      const result = await api.applyRulesToItem(target.id, selectedType.tagRules);
      totalTagged += result.tagged;
      progressDone.value += 1;
    }
    if (totalTagged > 0) showToast(`已自動套用 ${totalTagged} 個標籤`, 'success');
  } catch { /* ignore */ }
};

const submitFolderModal = async () => {
  const { path, name, category } = editFolder.value;
  if (!path || !name || isSavingFolder.value) return;
  isSavingFolder.value = true;
  progressDone.value = 0;
  progressTotal.value = 1;
  progressLabel.value = '準備套用類別...';
  try {
    const subdirs = applyToSubfolders.value || applyToSubfiles.value
      ? await collectAllSubdirs(path)
      : [];
    const subfiles = applyToSubfiles.value
      ? await collectAllSubfiles(path, subdirs)
      : [];

    await loadItemTypes();
    const selectedType = getTypeConfig(category);
    const categoryTargetCount = 1 + (applyToSubfolders.value ? subdirs.length : 0) + (applyToSubfiles.value ? subfiles.length : 0);
    const ruleTargetCount = selectedType.tagRules?.length ? categoryTargetCount : 0;
    progressTotal.value = categoryTargetCount + ruleTargetCount;

    progressLabel.value = `套用目前資料夾：${name.trim()}`;
    const saved = await saveFolderCategory(path, name.trim(), category);
    progressDone.value += 1;
    folderInDb.value = { id: saved.id };

    const subfolderItems = await applySubfolderCategories(subdirs, category);
    const subfileItems = await applySubfileCategories(subfiles, category);
    const allTargets = [saved, ...subfolderItems, ...subfileItems];

    progressLabel.value = '更新畫面狀態...';
    await refreshFolderState();
    await runRulesForCategory(allTargets, selectedType);
    modalPhase.value = 'tags';
  } catch (e) {
    showToast('操作失敗: ' + String(e), 'error');
  } finally {
    isSavingFolder.value = false;
    progressLabel.value = '';
  }
};

onUnmounted(() => document.removeEventListener('click', closeCtxMenu));

const dbFolders = ref<Item[]>([]);
const folderByPath = computed(() => new Map(dbFolders.value.map(f => [f.path, f])));
const hasFolderCategory = (path: string): boolean => {
  const f = folderByPath.value.get(path);
  return !!f?.category && f.category !== 'default';
};
provide('folderByPath', folderByPath);
const { applyRulesForTarget } = useFolderRuleActions(
  undefined,
  () => itemTypes.value,
  showToast,
  closeCtxMenu
);

const applyRulesFromCtx = async () => {
  const path = ctxMenu.value.path;
  await applyRulesForTarget({
    path,
    category: folderByPath.value.get(path)?.category,
  });
  emit('folderCreated');
};

const loadDbFolders = async () => {
  const page = await api.getItems(0, 9999, undefined, undefined, undefined, undefined, 'folder');
  dbFolders.value = page.content;
};

const sources = ref<Source[]>([]);

const loadSources = async () => {
  sources.value = await api.getSources();
  if (props.selectedPath === null && sources.value.length > 0) {
    emit('select', sources.value[0].path);
  }
};

const initWorkspace = async () => {
  const [srcs, folderPage] = await Promise.all([
    api.getSources(),
    api.getItems(0, 9999, undefined, undefined, undefined, undefined, 'folder'),
  ]);
  sources.value = srcs;
  dbFolders.value = folderPage.content;
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
      <div class="ctx-item" @click="openModifyTypeFromCtx">{{ hasFolderCategory(ctxMenu.path) ? '修改類別' : '新增類別' }}</div>
      <div class="ctx-item" @click="applyRulesFromCtx">重新套用類別</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item ctx-danger" @click="untrackFromCtx">移除追蹤記錄</div>
    </div>

    <!-- 修改類型 / 加入知識庫 Modal -->
    <div v-if="showFolderModal" class="folder-modal-backdrop" @click.self="!isSavingFolder && (showFolderModal = false)">
      <div class="folder-modal glass-panel">
        <template v-if="modalPhase === 'edit'">
          <h3>{{ folderInDb ? '修改類別' : '加入知識庫' }}</h3>
          <div class="folder-field">
            <label>路徑</label>
            <span class="path-text">{{ editFolder.path }}</span>
          </div>
          <div class="folder-field">
            <label>名稱</label>
            <input v-model="editFolder.name" class="folder-input" placeholder="顯示名稱" :disabled="isSavingFolder" />
          </div>
          <div class="folder-field">
            <label>類別</label>
            <select v-model="editFolder.category" class="folder-input" :disabled="isSavingFolder">
              <option v-for="t in itemTypes" :key="t.name" :value="t.name">
                {{ t.icon }} {{ t.displayName }}
              </option>
            </select>
          </div>
          <label class="apply-sub-check">
            <input type="checkbox" v-model="applyToSubfolders" :disabled="isSavingFolder" />
            套用至所有子資料夾
          </label>
          <label class="apply-sub-check">
            <input type="checkbox" v-model="applyToSubfiles" :disabled="isSavingFolder" />
            套用至所有子檔案
          </label>
          <div v-if="isSavingFolder" class="folder-progress" aria-live="polite">
            <div class="progress-meta">
              <span>{{ progressLabel }}</span>
              <span>{{ progressDone }} / {{ progressTotal }}</span>
            </div>
            <div class="progress-track">
              <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
            </div>
          </div>
          <div class="folder-actions">
            <button class="btn-cancel" @click="showFolderModal = false" :disabled="isSavingFolder">取消</button>
            <button class="btn-confirm" @click="submitFolderModal" :disabled="!editFolder.name || isSavingFolder">
              {{ isSavingFolder ? `套用中 ${progressPercent}%` : '下一步：設定標籤' }}
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

.btn-add, .btn-manage {
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

.folder-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0 2px;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 0.75rem;
}

.progress-meta span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-overlay-soft);
}

.progress-bar {
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 0.18s ease;
}

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
