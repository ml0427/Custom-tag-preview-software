<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide } from 'vue';
import { api, type Tag, type Item, type FileItem, type FolderRulePreset, type ItemType } from '../api';
import LocalDirTree from './LocalDirTree.vue';
import { useTagManager } from '../composables/useTagManager';
import { useToast } from '../composables/useToast';
import { useItemTypes } from '../composables/useItemTypes';
import { useFolderRuleActions } from '../composables/useFolderRuleActions';
import { useSources } from '../composables/useSources';

const props = defineProps<{ selectedPath: string | null }>();
const emit = defineEmits<{
  (e: 'select', path: string | null): void;
  (e: 'folderCreated'): void;
}>();

const { show: showToast, confirm: confirmDialog } = useToast();
const { itemTypes, load: loadItemTypes } = useItemTypes();
// 右鍵選單
const panelRef = ref<HTMLElement | null>(null);
const ctxMenu = ref({ visible: false, x: 0, y: 0, path: '' });
const showFolderModal = ref(false);
const modalPhase = ref<'edit' | 'tags'>('edit');
const folderInDb = ref<{ id: number } | null>(null);
const editFolder = ref({ path: '', name: '' });
const selectedRulePresetId = ref<number | null>(null);
const rememberRulePreset = ref(true);
const applyToSubfolders = ref(false);
const applyToSubfiles = ref(false);
const subfileExtensionInput = ref('');
const isSavingFolder = ref(false);
const progressDone = ref(0);
const progressTotal = ref(0);
const progressLabel = ref('');
const allTags = ref<Tag[]>([]);
const folderRulePresets = ref<FolderRulePreset[]>([]);

const rulePresetOptions = computed(() => itemTypes.value.filter(t => t.tagRules?.length));
const selectedRulePreset = computed(() => (
  selectedRulePresetId.value == null
    ? null
    : itemTypes.value.find(t => t.id === selectedRulePresetId.value) ?? null
));

const progressPercent = computed(() => {
  if (progressTotal.value <= 0) return 0;
  return Math.min(100, Math.round((progressDone.value / progressTotal.value) * 100));
});

const subfileExtensions = computed(() => (
  subfileExtensionInput.value
    .split(/[\s,，、]+/)
    .map(ext => ext.trim().toLowerCase())
    .filter(Boolean)
    .map(ext => ext.startsWith('.') ? ext : `.${ext}`)
));

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
  const menuWidth = 160;
  const menuHeight = 200;
  let x = payload.x;
  let y = payload.y;
  if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
  if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
  ctxMenu.value = { visible: true, x: Math.max(0, x), y: Math.max(0, y), path: payload.path };
};

const closeCtxMenu = () => { ctxMenu.value.visible = false; };

const preventNativeContextMenu = (event: MouseEvent) => {
  if (!(event.target instanceof Node) || !panelRef.value?.contains(event.target)) return;
  event.preventDefault();
};

const untrackFromCtx = async () => {
  const p = ctxMenu.value.path;
  closeCtxMenu();
  if (!await confirmDialog(`確定移除「${p.replace(/\\/g, '/').split('/').pop()}」的追蹤記錄？\n（不刪除實際檔案）`)) return;
  try {
    await api.untrackItem(p, { allowMissing: true });
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
  await loadItemTypes();
  allTags.value = await api.getTags();
  const existing = dbFolders.value.find(f => f.path === p);
  if (existing) {
    folderInDb.value = { id: existing.id };
    editFolder.value = { path: p, name: existing.name };
    const preset = folderRulePresetByItemId.value.get(existing.id) ?? await api.getFolderRulePreset(existing.id);
    selectedRulePresetId.value = preset?.presetTypeId ?? null;
    rememberRulePreset.value = !!preset;
    initTags(existing.tags ?? []);
  } else {
    folderInDb.value = null;
    editFolder.value = {
      path: p,
      name: p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p,
    };
    selectedRulePresetId.value = null;
    rememberRulePreset.value = true;
    initTags([]);
  }
  applyToSubfolders.value = false;
  applyToSubfiles.value = false;
  subfileExtensionInput.value = '';
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

/// 確保某個路徑在 DB 有 row，並設定它的顯示名稱。
/// 對「主路徑」我們會用使用者填的 name；對自動帶入的子目錄則沿用 file_name。
const saveTrackedItem = async (
  path: string,
  displayName: string,
): Promise<Item> => {
  const item = await api.quickImportItem(path);
  if (item.name !== displayName) {
    await api.setItemDisplayName(item.id, displayName);
  }
  return { ...item, name: displayName };
};

const getFolderDisplayName = (path: string): string => (
  path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path
);

const trackSubfolders = async (subdirs: string[]): Promise<Item[]> => {
  if (!applyToSubfolders.value) return [];

  const result: Item[] = [];
  for (const subPath of subdirs) {
    progressLabel.value = `加入子資料夾：${getFolderDisplayName(subPath)}`;
    result.push(await saveTrackedItem(subPath, getFolderDisplayName(subPath)));
    progressDone.value += 1;
  }
  return result;
};

const collectAllSubfiles = async (parentPath: string, subdirs: string[]): Promise<FileItem[]> => {
  const scanTargets = [parentPath, ...subdirs];
  const result: FileItem[] = [];
  const extensions = subfileExtensions.value;
  const matchesExtension = (file: FileItem) => {
    if (extensions.length === 0) return true;
    const normalizedPath = file.path.toLowerCase();
    return extensions.some(ext => normalizedPath.endsWith(ext));
  };

  for (const dirPath of scanTargets) {
    try {
      const children = await api.listDirFiles(dirPath);
      result.push(...children.filter(child => !child.isDir && matchesExtension(child)));
    } catch {}
  }

  return result;
};

const trackSubfiles = async (subfiles: FileItem[]): Promise<Item[]> => {
  if (!applyToSubfiles.value) return [];

  const result: Item[] = [];
  for (const file of subfiles) {
    progressLabel.value = `加入子檔案：${file.name}`;
    result.push(await saveTrackedItem(file.path, file.name));
    progressDone.value += 1;
  }
  return result;
};

const refreshFolderState = async () => {
  await loadDbFolders();
  emit('folderCreated');
};

const runRulesForPreset = async (targets: Item[], selectedType: ItemType) => {
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
  const { path, name } = editFolder.value;
  if (!path || !name || isSavingFolder.value) return;
  isSavingFolder.value = true;
  progressDone.value = 0;
  progressTotal.value = 1;
  progressLabel.value = '準備加入知識庫...';
  try {
    const subdirs = applyToSubfolders.value || applyToSubfiles.value
      ? await collectAllSubdirs(path)
      : [];
    const subfiles = applyToSubfiles.value
      ? await collectAllSubfiles(path, subdirs)
      : [];

    await loadItemTypes();
    const selectedType = selectedRulePreset.value;
    const trackedTargetCount = 1 + (applyToSubfolders.value ? subdirs.length : 0) + (applyToSubfiles.value ? subfiles.length : 0);
    const ruleTargetCount = selectedType?.tagRules?.length ? trackedTargetCount : 0;
    progressTotal.value = trackedTargetCount + ruleTargetCount;

    progressLabel.value = `加入目前資料夾：${name.trim()}`;
    const saved = await saveTrackedItem(path, name.trim());
    progressDone.value += 1;
    folderInDb.value = { id: saved.id };

    const subfolderItems = await trackSubfolders(subdirs);
    const subfileItems = await trackSubfiles(subfiles);
    const allTargets = [saved, ...subfolderItems, ...subfileItems];

    if (selectedType && rememberRulePreset.value) {
      progressLabel.value = '儲存資料夾預設規則集...';
      await api.setFolderRulePreset({
        folderItemId: saved.id,
        presetTypeId: selectedType.id,
        applyToSubfolders: applyToSubfolders.value,
        applyToFiles: applyToSubfiles.value,
        fileExtensions: subfileExtensions.value,
      });
    } else {
      await api.clearFolderRulePreset(saved.id);
    }

    progressLabel.value = '更新畫面狀態...';
    await refreshFolderState();
    if (selectedType) await runRulesForPreset(allTargets, selectedType);
    modalPhase.value = 'tags';
  } catch (e) {
    showToast('操作失敗: ' + String(e), 'error');
  } finally {
    isSavingFolder.value = false;
    progressLabel.value = '';
  }
};

onUnmounted(() => {
  document.removeEventListener('click', closeCtxMenu);
  document.removeEventListener('scroll', closeCtxMenu, { capture: true } as any);
  document.removeEventListener('contextmenu', closeCtxMenu);
  document.removeEventListener('contextmenu', preventNativeContextMenu, { capture: true } as any);
});

const dbFolders = ref<Item[]>([]);
const folderByPath = computed(() => new Map(dbFolders.value.map(f => [f.path, f])));
const folderRulePresetByItemId = computed(() => new Map(folderRulePresets.value.map(p => [p.folderItemId, p])));
const folderRulePresetByPath = computed(() => {
  const entries: Array<[string, FolderRulePreset]> = [];
  for (const folder of dbFolders.value) {
    const preset = folderRulePresetByItemId.value.get(folder.id);
    if (preset) entries.push([folder.path, preset]);
  }
  return new Map(entries);
});
const hasFolderRulePreset = (path: string): boolean => folderRulePresetByPath.value.has(path);
provide('folderByPath', folderByPath);
const { applyRulesForTarget } = useFolderRuleActions(
  undefined,
  () => itemTypes.value,
  showToast,
  closeCtxMenu
);

const applyRulesFromCtx = async () => {
  const path = ctxMenu.value.path;
  const preset = folderRulePresetByPath.value.get(path);
  await applyRulesForTarget({
    path,
    presetTypeId: preset?.presetTypeId,
  });
  emit('folderCreated');
};

const enterFolderFromCtx = () => {
  emit('select', ctxMenu.value.path);
  closeCtxMenu();
};

const openInExplorerFromCtx = async () => {
  try {
    await api.openInExplorer(ctxMenu.value.path);
  } catch (e) {
    showToast('開啟檔案總管失敗: ' + String(e), 'error');
  }
  closeCtxMenu();
};

const loadDbFolders = async () => {
  const [page, presets] = await Promise.all([
    api.getItems(0, 9999, undefined, undefined, undefined, undefined, 'folder'),
    api.getFolderRulePresets(),
  ]);
  dbFolders.value = page.content;
  folderRulePresets.value = presets;
};

const {
  sources,
  isSourceBusy,
  sourceProgressLabel,
  loadSources,
  handleSelectPath,
  handleAddSource,
  handleRemoveSource,
} = useSources({
  selectedPath: () => props.selectedPath,
  select: path => emit('select', path),
  showToast,
  confirmDialog,
});

const initWorkspace = async () => {
  await Promise.all([loadSources(), loadDbFolders()]);
};

onMounted(() => {
  initWorkspace();
  loadItemTypes();
  document.addEventListener('click', closeCtxMenu);
  document.addEventListener('scroll', closeCtxMenu, { capture: true });
  document.addEventListener('contextmenu', closeCtxMenu);
  document.addEventListener('contextmenu', preventNativeContextMenu, { capture: true });
});
</script>

<template>
  <div ref="panelRef" class="panel" @contextmenu.prevent>
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
      <div class="ctx-item" @click="enterFolderFromCtx">進入資料夾</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item" @click="openModifyTypeFromCtx">{{ folderByPath.has(ctxMenu.path) ? '編輯標籤' : '加入知識庫' }}</div>
      <div v-if="hasFolderRulePreset(ctxMenu.path)" class="ctx-item" @click="applyRulesFromCtx">套用既有標籤規則</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item" @click="openInExplorerFromCtx">在檔案總管中顯示</div>
      <div class="ctx-item ctx-danger" @click="untrackFromCtx">移除追蹤記錄</div>
    </div>

    <!-- 加入知識庫 / 設定標籤 Modal -->
    <div v-if="showFolderModal" class="folder-modal-backdrop" @click.self="!isSavingFolder && (showFolderModal = false)">
      <div class="folder-modal glass-panel">
        <template v-if="modalPhase === 'edit'">
          <h3>{{ folderInDb ? '編輯資料夾標籤' : '加入知識庫' }}</h3>
          <div class="folder-field">
            <label>路徑</label>
            <span class="path-text">{{ editFolder.path }}</span>
          </div>
          <div class="folder-field">
            <label>名稱</label>
            <input v-model="editFolder.name" class="folder-input" placeholder="顯示名稱" :disabled="isSavingFolder" />
          </div>
          <div class="folder-field">
            <label>標籤規則集（選填）</label>
            <select v-model="selectedRulePresetId" class="folder-input" :disabled="isSavingFolder">
              <option :value="null">不使用規則集</option>
              <option v-for="t in rulePresetOptions" :key="t.id" :value="t.id">
                {{ t.icon }} {{ t.displayName }}
              </option>
            </select>
            <p class="field-hint">只用來套用標籤規則，不會改變資料夾本身；資料夾仍是單純資料夾。</p>
          </div>
          <label class="apply-sub-check">
            <input type="checkbox" v-model="rememberRulePreset" :disabled="isSavingFolder || selectedRulePresetId == null" />
            記住為這個資料夾的預設標籤規則集
          </label>
          <label class="apply-sub-check">
            <input type="checkbox" v-model="applyToSubfolders" :disabled="isSavingFolder" />
            同時加入所有子資料夾
          </label>
          <label class="apply-sub-check">
            <input type="checkbox" v-model="applyToSubfiles" :disabled="isSavingFolder" />
            同時加入所有子檔案
          </label>
          <div v-if="applyToSubfiles" class="folder-field subfile-extension-field">
            <label>子檔案副檔名</label>
            <input
              v-model="subfileExtensionInput"
              class="folder-input"
              placeholder="jpg, png, mp4；空白代表全部"
              :disabled="isSavingFolder"
            />
          </div>
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
      <div v-if="isSourceBusy" class="folder-progress source-progress" aria-live="polite">
        <div class="progress-meta">
          <span>{{ sourceProgressLabel }}</span>
        </div>
        <div class="progress-track">
          <div class="progress-bar progress-bar-indeterminate"></div>
        </div>
      </div>
      <button class="btn-add" :disabled="isSourceBusy" @click="handleAddSource">
        {{ isSourceBusy ? '處理中...' : '＋ 新增目錄' }}
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
.subfile-extension-field {
  margin-left: 22px;
  min-width: 0;
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

.field-hint {
  margin: -6px 0 2px;
  color: var(--text-tertiary);
  font-size: 0.78rem;
  line-height: 1.4;
}

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

.source-progress {
  padding: 0 0 8px;
}

.progress-bar-indeterminate {
  width: 42%;
  animation: progress-slide 1s ease-in-out infinite;
}

@keyframes progress-slide {
  0% { transform: translateX(-110%); }
  100% { transform: translateX(240%); }
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
