<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { api, type Item, type FileItem } from '../api';
import PreviewPane from './PreviewPane.vue';
import FileExplorerTable from './FileExplorerTable.vue';
import ThumbnailGridView from './ThumbnailGridView.vue';
import { useToast } from '../composables/useToast';

const props = defineProps<{
  sourcePath: string | null;
  selectedTagId?: number | null;
}>();

const emit = defineEmits<{
  (e: 'showDetail', item: Item): void;
  (e: 'showFolderDetail', item: Item): void;
  (e: 'navigateDir', path: string): void;
  (e: 'jumpToTag', tagId: number): void;
}>();

const { show: showToast, confirm: confirmDialog } = useToast();
const itemsData = ref<Item[]>([]);
const fileItems = ref<FileItem[]>([]);
const isLoading = ref(false);
const gallerySearch = ref('');

// O(1) lookup by path
const itemByPath = computed(() =>
  new Map(itemsData.value.map(i => [i.path, i]))
);

const filteredFileItems = computed(() => {
  // Tag mode (any): use backend-filtered itemsData converted to FileItem
  // No-tag source mode: use raw filesystem listing
  const base: FileItem[] = (props.selectedTagId != null)
    ? itemsData.value.map(item => ({
        name: item.name,
        path: item.path,
        isDir: item.itemType === 'folder',
        fileSize: item.fileSize,
        modifiedTime: item.fileModifiedAt
          ? new Date(item.fileModifiedAt * 1000).toLocaleDateString('zh-TW')
          : null,
        extension: item.itemType === 'file'
          ? item.path.split('.').pop()?.toLowerCase() ?? null
          : null,
      }))
    : fileItems.value;

  let items = base;
  const q = gallerySearch.value.trim().toLowerCase();
  if (q) items = items.filter(i => i.name.toLowerCase().includes(q));
  return items;
});

const selectedFileItemPath = ref<string | null>(null);
const selectedItem = ref<Item | null>(null);
const selectedPaths = ref<string[]>([]);
const lastClickIdx = ref(-1);
const isBatchDeleting = ref(false);

// ── Batch tag picker ──────────────────────────────────────────────────────────
type TagPickerMode = 'add' | 'remove' | null;
const tagPickerMode = ref<TagPickerMode>(null);
const tagPickerSearch = ref('');
const tagPickerSuggestions = ref<{ id: number; name: string }[]>([]);
const isBatchTagging = ref(false);
let tagDebounce: ReturnType<typeof setTimeout> | null = null;

const selectedItemsData = computed(() =>
  selectedPaths.value.flatMap(p => {
    const item = itemByPath.value.get(p);
    return item ? [item] : [];
  })
);

const removableTags = computed(() => {
  const map = new Map<number, string>();
  selectedItemsData.value.forEach(item =>
    item.tags.forEach(t => map.set(t.id, t.name))
  );
  return [...map.entries()].map(([id, name]) => ({ id, name }));
});

const openTagPicker = (mode: 'add' | 'remove') => {
  tagPickerMode.value = mode;
  tagPickerSearch.value = '';
  tagPickerSuggestions.value = [];
};

const closeTagPicker = () => {
  tagPickerMode.value = null;
  tagPickerSearch.value = '';
  tagPickerSuggestions.value = [];
};

const onTagPickerInput = () => {
  if (tagDebounce) clearTimeout(tagDebounce);
  const q = tagPickerSearch.value.trim();
  if (!q) { tagPickerSuggestions.value = []; return; }
  tagDebounce = setTimeout(async () => {
    tagPickerSuggestions.value = await api.searchTags(q);
  }, 200);
};

const batchAddTag = async (tag: { id: number; name: string }) => {
  closeTagPicker();
  isBatchTagging.value = true;
  try {
    const ids = selectedItemsData.value.map(i => i.id);
    await Promise.all(ids.map(id => api.tagItem(id, tag.id)));
    await loadAll();
    showToast(`已為 ${ids.length} 個項目加上「${tag.name}」`, 'success');
  } catch (e: any) {
    showToast('批次加標籤失敗：' + (e?.message ?? e), 'error');
  } finally {
    isBatchTagging.value = false;
  }
};

const batchRemoveTag = async (tag: { id: number; name: string }) => {
  closeTagPicker();
  isBatchTagging.value = true;
  try {
    const ids = selectedItemsData.value.map(i => i.id);
    await Promise.all(ids.map(id => api.untagItem(id, tag.id).catch(() => {})));
    await loadAll();
    showToast(`已從 ${ids.length} 個項目移除「${tag.name}」`, 'success');
  } catch (e: any) {
    showToast('批次移標籤失敗：' + (e?.message ?? e), 'error');
  } finally {
    isBatchTagging.value = false;
  }
};

const handleFileItemClick = (item: FileItem, event?: MouseEvent) => {
  const list = filteredFileItems.value;
  const idx = list.findIndex(i => i.path === item.path);

  if (event?.ctrlKey || event?.metaKey) {
    const newSet = new Set(selectedPaths.value);
    if (newSet.has(item.path)) newSet.delete(item.path);
    else { newSet.add(item.path); lastClickIdx.value = idx; }
    selectedPaths.value = [...newSet];
  } else if (event?.shiftKey && lastClickIdx.value >= 0) {
    const start = Math.min(lastClickIdx.value, idx);
    const end = Math.max(lastClickIdx.value, idx);
    const newSet = new Set(selectedPaths.value);
    for (let i = start; i <= end; i++) newSet.add(list[i].path);
    selectedPaths.value = [...newSet];
  } else {
    selectedPaths.value = [item.path];
    lastClickIdx.value = idx;
  }

  selectedFileItemPath.value = item.path;
  selectedItem.value = itemByPath.value.get(item.path) ?? null;
};

const clearMultiSelect = () => {
  selectedPaths.value = selectedFileItemPath.value ? [selectedFileItemPath.value] : [];
};

const batchDelete = async () => {
  const paths = selectedPaths.value;
  if (!paths.length) return;
  if (!await confirmDialog(`確定將選取的 ${paths.length} 個項目移至資源回收筒？`)) return;
  isBatchDeleting.value = true;
  try {
    await Promise.all(paths.map(p => api.trashItem(p)));
    selectedPaths.value = [];
    selectedFileItemPath.value = null;
    selectedItem.value = null;
    await loadAll();
  } catch (e: any) {
    showToast('批次刪除失敗：' + (e?.message ?? e), 'error');
  } finally {
    isBatchDeleting.value = false;
  }
};

const ARCHIVE_EXTS = ['zip', 'rar', '7z', 'cbz', 'cbr'];

const handleFileItemDblClick = (item: FileItem) => {
  if (item.isDir) {
    emit('navigateDir', item.path);
  } else if (ARCHIVE_EXTS.includes(item.extension?.toLowerCase() ?? '')) {
    api.openFile(item.path);
  } else {
    const dbItem = itemByPath.value.get(item.path);
    if (dbItem) emit('showDetail', dbItem);
    else api.openFile(item.path);
  }
};

const handleContextDetail = (fileItem: FileItem) => {
  const dbItem = itemByPath.value.get(fileItem.path);
  if (!dbItem) return;
  if (fileItem.isDir) emit('showFolderDetail', dbItem);
  else emit('showDetail', dbItem);
};

const handleContextRename = async (fileItem: FileItem, newName: string) => {
  const dbItem = itemByPath.value.get(fileItem.path);
  if (!dbItem) return;
  try {
    const updated = await api.renameItem(dbItem.id, newName);
    handleRenamed(updated);
  } catch (e: any) {
    showToast('重新命名失敗：' + (e?.message ?? e), 'error');
  }
};

const loadFileItems = async () => {
  if (!props.sourcePath) { fileItems.value = []; return; }
  try {
    fileItems.value = await api.listDirFiles(props.sourcePath);
  } catch {
    fileItems.value = [];
  }
};

const loadItemsBackground = async () => {
  try {
    const tagId = props.selectedTagId ?? undefined;
    const res = await api.getItems(0, 9999, tagId, 'importAt', 'desc', props.sourcePath ?? undefined);
    itemsData.value = res.content;
  } catch {
    itemsData.value = [];
  }
};

const handleDelete = async (fileItem: FileItem) => {
  const label = fileItem.isDir ? `資料夾「${fileItem.name}」` : `檔案「${fileItem.name}」`;
  if (!await confirmDialog(`確定將 ${label} 移至資源回收筒？`)) return;
  try {
    await api.trashItem(fileItem.path);
    if (selectedFileItemPath.value === fileItem.path) {
      selectedFileItemPath.value = null;
      selectedItem.value = null;
    }
    selectedPaths.value = selectedPaths.value.filter(p => p !== fileItem.path);
    await loadAll();
  } catch (e: any) {
    showToast('刪除失敗：' + (e?.message ?? e), 'error');
  }
};

const handleRenamed = (updated: Item) => {
  selectedItem.value = updated;
  const idx = itemsData.value.findIndex(i => i.id === updated.id);
  if (idx !== -1) itemsData.value[idx] = updated;
};

// View mode
const viewMode = ref<'list' | 'grid'>('list');

// Preview toggle
const isPreviewOpen = ref(false);
const togglePreview = () => { isPreviewOpen.value = !isPreviewOpen.value; };

// Resizing
const previewWidth = ref(350);
const isResizing = ref(false);

const startResizing = () => {
  isResizing.value = true;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', stopResizing);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isResizing.value) return;
  const newWidth = window.innerWidth - e.clientX;
  if (newWidth >= 200 && newWidth <= 600) previewWidth.value = newWidth;
};

const stopResizing = () => {
  isResizing.value = false;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', stopResizing);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

const loadAll = async () => {
  isLoading.value = true;
  fileItems.value = [];
  itemsData.value = [];
  selectedItem.value = null;
  selectedPaths.value = [];
  try {
    await Promise.all([loadFileItems(), loadItemsBackground()]);
    // 若沒有明確選取項目，自動把當前資料夾設為 preview item（樹狀圖導航用）
    if (!selectedFileItemPath.value && props.sourcePath) {
      const folderItem = await api.getItemByPath(props.sourcePath).catch(() => null);
      if (folderItem) selectedItem.value = folderItem;
    }
  } catch (e) {
    console.error(e);
  } finally {
    isLoading.value = false;
  }
};

watch(() => props.sourcePath, () => {
  selectedFileItemPath.value = null;
  selectedPaths.value = [];
  lastClickIdx.value = -1;
  loadAll();
});

watch(() => props.selectedTagId, async () => {
  isLoading.value = true;
  itemsData.value = [];
  try { await loadItemsBackground(); }
  catch (e) { console.error(e); }
  finally { isLoading.value = false; }
});

onMounted(() => {
  loadAll();
  document.addEventListener('click', onDocClick);
});
onUnmounted(() => {
  stopResizing();
  document.removeEventListener('click', onDocClick);
});

const onDocClick = (e: MouseEvent) => {
  if (tagPickerMode.value && !(e.target as HTMLElement).closest('.batch-tag-wrap')) {
    closeTagPicker();
  }
};

defineExpose({ refresh: () => loadAll() });

// ── Toolbar ───────────────────────────────────────────────────────────────────

const parentPath = computed(() => {
  if (!props.sourcePath) return null;
  // Preserve original separator — normalizing to '/' breaks DB LIKE queries on Windows
  const p = props.sourcePath.replace(/[/\\]+$/, '');
  const lastSep = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return lastSep > 0 ? p.slice(0, lastSep) : null;
});

const currentDirName = computed(() => {
  if (!props.sourcePath) return '';
  return props.sourcePath.replace(/\\/g, '/').replace(/\/$/, '').split('/').pop() ?? '';
});

const goUp = () => { if (parentPath.value) emit('navigateDir', parentPath.value); };
</script>

<template>
  <div class="main-layout">
    <div class="gallery-container">
      <div class="header">
        <div class="search-bar-wrap">
          <template v-if="sourcePath">
            <button class="nav-btn" :disabled="!parentPath" @click="goUp" title="上一層">↑</button>
            <button class="nav-btn" @click="loadAll" :class="{ spinning: isLoading }" title="重新整理">↺</button>
            <span class="dir-name">{{ currentDirName }}</span>
            <span class="divider"></span>
          </template>
          <span class="search-icon">🔍</span>
          <input
            v-model="gallerySearch"
            class="gallery-search"
            placeholder="搜尋名稱..."
          />
          <button v-if="gallerySearch" class="clear-btn" @click="gallerySearch = ''" title="清除搜尋">✕</button>
          <span class="search-count" v-if="sourcePath">
            <template v-if="gallerySearch.trim()">{{ filteredFileItems.length }} / {{ fileItems.length }} 項</template>
            <template v-else>{{ fileItems.length }} 項</template>
          </span>
          <div class="view-toggle">
            <button
              class="view-btn"
              :class="{ active: viewMode === 'list' }"
              @click="viewMode = 'list'"
              title="列表檢視"
            >☰</button>
            <button
              class="view-btn"
              :class="{ active: viewMode === 'grid' }"
              @click="viewMode = 'grid'"
              title="縮圖格子"
            >⊞</button>
          </div>
        </div>
      </div>

      <div class="table-wrapper">
        <div v-if="!sourcePath && !selectedTagId" class="no-workspace-state">
          <div class="no-workspace-icon">📂</div>
          <p>請從左側選擇工作目錄或標籤</p>
        </div>

        <div v-else-if="isLoading" class="loader">
          <div class="spinner"></div>
          <p>載入中...</p>
        </div>

        <div v-else-if="filteredFileItems.length === 0" class="empty-state">
          <h3>此目錄沒有任何檔案</h3>
        </div>

        <FileExplorerTable
          v-else-if="viewMode === 'list'"
          :items="filteredFileItems"
          :itemByPath="itemByPath"
          :selectedItemPath="selectedFileItemPath"
          :selectedPaths="selectedPaths"
          :searchQuery="gallerySearch"
          @click="handleFileItemClick"
          @dblclick="handleFileItemDblClick"
          @detail="handleContextDetail"
          @rename="handleContextRename"
          @delete="handleDelete"
        />
        <ThumbnailGridView
          v-else
          :items="filteredFileItems"
          :itemByPath="itemByPath"
          :selectedItemPath="selectedFileItemPath"
          :selectedPaths="selectedPaths"
          :searchQuery="gallerySearch"
          @click="handleFileItemClick"
          @dblclick="handleFileItemDblClick"
          @detail="handleContextDetail"
          @rename="handleContextRename"
          @delete="handleDelete"
        />
      </div>

      <div class="status-bar">
        <span v-if="sourcePath">{{ filteredFileItems.length }} 個項目</span>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="selectedPaths.length > 1" class="batch-action-bar">
        <span class="batch-count">已選取 {{ selectedPaths.length }} 項</span>
        <button class="batch-btn" @click="clearMultiSelect">取消選取</button>

        <!-- 加標籤 -->
        <div class="batch-tag-wrap">
          <button class="batch-btn" :disabled="isBatchTagging" @click="tagPickerMode === 'add' ? closeTagPicker() : openTagPicker('add')">
            ＋ 加標籤
          </button>
          <div v-if="tagPickerMode === 'add'" class="tag-picker-popover">
            <input
              ref="tagSearchInput"
              v-model="tagPickerSearch"
              class="tag-picker-input"
              placeholder="搜尋標籤…"
              @input="onTagPickerInput"
              autofocus
            />
            <div class="tag-picker-list">
              <div
                v-for="t in tagPickerSuggestions"
                :key="t.id"
                class="tag-picker-item"
                @mousedown.prevent="batchAddTag(t)"
              >{{ t.name }}</div>
              <div v-if="tagPickerSearch && !tagPickerSuggestions.length" class="tag-picker-empty">無符合標籤</div>
            </div>
          </div>
        </div>

        <!-- 移標籤 -->
        <div class="batch-tag-wrap">
          <button class="batch-btn" :disabled="isBatchTagging || !removableTags.length" @click="tagPickerMode === 'remove' ? closeTagPicker() : openTagPicker('remove')">
            － 移標籤
          </button>
          <div v-if="tagPickerMode === 'remove'" class="tag-picker-popover">
            <div class="tag-picker-list">
              <div
                v-for="t in removableTags"
                :key="t.id"
                class="tag-picker-item"
                @mousedown.prevent="batchRemoveTag(t)"
              >{{ t.name }}</div>
              <div v-if="!removableTags.length" class="tag-picker-empty">已選項目無標籤</div>
            </div>
          </div>
        </div>

        <button class="batch-btn batch-danger" :disabled="isBatchDeleting" @click="batchDelete">
          {{ isBatchDeleting ? '刪除中...' : '移至資源回收筒' }}
        </button>
      </div>
    </Teleport>

    <button class="preview-toggle-btn" @click="togglePreview" :title="isPreviewOpen ? '收起預覽' : '展開預覽'">
      {{ isPreviewOpen ? '›' : '‹' }}
    </button>

    <div
      v-if="isPreviewOpen"
      class="resizer"
      :class="{ 'is-resizing': isResizing }"
      @mousedown="startResizing"
    ></div>

    <PreviewPane
      v-if="isPreviewOpen"
      :item="selectedItem"
      :style="{ width: previewWidth + 'px', minWidth: previewWidth + 'px' }"
      @show-detail="emit('showDetail', $event)"
      @show-folder-detail="emit('showFolderDetail', $event)"
      @tag-click="emit('jumpToTag', $event.id)"
      @renamed="handleRenamed"
    />
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
  height: 100vh;
}

.gallery-container {
  flex: 1;
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.resizer {
  width: 4px;
  height: 100vh;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s, width 0.2s;
  z-index: 100;
  position: relative;
}

.resizer:hover, .resizer.is-resizing {
  background: var(--accent-color);
  width: 6px;
  box-shadow: 0 0 10px var(--accent-color);
}

.header { margin-bottom: 20px; }

.search-bar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--panel-bg);
  border-radius: 12px;
  border: 1px solid var(--panel-border);
}

.nav-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 1rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
}
.nav-btn:hover:not(:disabled) { color: var(--text-primary); background: rgba(255,255,255,0.07); }
.nav-btn:disabled { opacity: 0.3; cursor: default; }
.nav-btn.spinning { animation: spin 0.5s linear; }
@keyframes spin { to { transform: rotate(360deg); } }

.dir-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.divider {
  width: 1px;
  height: 16px;
  background: var(--panel-border);
  flex-shrink: 0;
}

.clear-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  flex-shrink: 0;
  line-height: 1;
}
.clear-btn:hover { color: var(--text-primary); background: rgba(255,255,255,0.07); }

.search-icon { font-size: 0.95rem; flex-shrink: 0; }

.gallery-search {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.gallery-search::placeholder { color: var(--text-secondary); }

.view-toggle { display: flex; gap: 2px; flex-shrink: 0; }
.view-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary);
  font-size: 1rem;
  cursor: pointer;
  padding: 3px 7px;
  border-radius: 5px;
  line-height: 1;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.view-btn:hover { color: var(--text-primary); background: rgba(255,255,255,0.07); }
.view-btn.active { color: var(--text-primary); background: rgba(255,255,255,0.1); border-color: var(--panel-border); }

.search-count {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.status-bar {
  padding: 6px 4px 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.table-wrapper {
  flex: 1;
  background: var(--panel-bg);
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-toggle-btn {
  width: 28px;
  flex-shrink: 0;
  background: var(--panel-bg);
  border: none;
  border-left: 1px solid var(--panel-border);
  color: var(--text-secondary);
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
}

.preview-toggle-btn:hover {
  background: rgba(255,255,255,0.07);
  color: var(--text-primary);
}

.loader, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 200px;
  color: var(--text-secondary);
}

.no-workspace-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  gap: 12px;
}

.no-workspace-icon {
  font-size: 3rem;
  opacity: 0.4;
}

.no-workspace-state p {
  font-size: 0.95rem;
  opacity: 0.6;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255,255,255,0.1);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 15px;
}

@keyframes spin { to { transform: rotate(360deg); } }

.batch-action-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #1e2130;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 10px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  z-index: 500;
  animation: slideUp 0.2s ease;
}
@keyframes slideUp {
  from { transform: translateX(-50%) translateY(20px); opacity: 0; }
  to   { transform: translateX(-50%) translateY(0);   opacity: 1; }
}
.batch-count { font-size: 0.88rem; color: var(--text-primary); font-weight: 600; }
.batch-btn {
  background: rgba(255,255,255,0.08);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
  padding: 6px 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.batch-btn:hover:not(:disabled) { background: rgba(255,255,255,0.15); }
.batch-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.batch-danger { color: #f87171; border-color: rgba(248,65,65,0.3); }
.batch-danger:hover:not(:disabled) { background: rgba(248,65,65,0.15); }

.batch-tag-wrap { position: relative; }
.tag-picker-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: #1e2130;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px;
  min-width: 180px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  z-index: 600;
}
.tag-picker-input {
  width: 100%;
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--panel-border);
  border-radius: 5px;
  color: var(--text-primary);
  font-size: 0.85rem;
  padding: 5px 8px;
  margin-bottom: 6px;
  outline: none;
  box-sizing: border-box;
}
.tag-picker-list { display: flex; flex-direction: column; gap: 2px; max-height: 160px; overflow-y: auto; }
.tag-picker-item {
  padding: 5px 8px;
  border-radius: 5px;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--text-primary);
}
.tag-picker-item:hover { background: rgba(255,255,255,0.1); }
.tag-picker-empty { font-size: 0.8rem; color: var(--text-secondary); padding: 4px 8px; }

</style>
