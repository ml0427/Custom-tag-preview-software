<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { api, type Item, type FileItem } from '../api';
import PreviewPane from './PreviewPane.vue';
import FileExplorerTable from './FileExplorerTable.vue';
import ThumbnailGridView from './ThumbnailGridView.vue';
import GalleryToolbar from './GalleryToolbar.vue';
import GalleryInfoBar from './GalleryInfoBar.vue';
import { useToast } from '../composables/useToast';
import { useGalleryData } from '../composables/useGalleryData';
import { formatSize } from '../utils/format';

const props = defineProps<{
  sourcePath: string | null;
  selectedTagIds?: number[];
}>();

const emit = defineEmits<{
  (e: 'showDetail', item: Item): void;
  (e: 'showFolderDetail', item: Item): void;
  (e: 'navigateDir', path: string): void;
  (e: 'jumpToTag', tagId: number): void;
}>();

const { show: showToast, confirm: confirmDialog } = useToast();

// Sort state
const VALID_SORT_BY = ['name', 'size', 'date'] as const;
const VALID_SORT_DIR = ['asc', 'desc'] as const;
const savedSortBy = localStorage.getItem('gallery-sort-by');
const savedSortDir = localStorage.getItem('gallery-sort-dir');

const sortBy = ref<'name' | 'size' | 'date'>(
  VALID_SORT_BY.includes(savedSortBy as any) ? (savedSortBy as any) : 'name'
);
const sortDir = ref<'asc' | 'desc'>(
  VALID_SORT_DIR.includes(savedSortDir as any) ? (savedSortDir as any) : 'asc'
);
const gallerySearch = ref('');

watch([sortBy, sortDir], ([by, dir]) => {
  localStorage.setItem('gallery-sort-by', by);
  localStorage.setItem('gallery-sort-dir', dir);
});

// Gallery logic composable
const {
  itemsData,
  fileItems,
  isLoading,
  tagPage,
  tagTotalPages,
  itemByPath,
  filteredFileItems,
  loadAll,
  gotoTagPage,
  loadItemsBackground,
} = useGalleryData(
  () => props.sourcePath,
  () => props.selectedTagIds,
  () => gallerySearch.value,
  () => sortBy.value,
  () => sortDir.value
);

const selectedFileItemPath = ref<string | null>(null);
const selectedItem = ref<Item | null>(null);
const selectedPaths = ref<string[]>([]);

const selectedFileItem = computed<FileItem | null>(() => {
  if (selectedItem.value) return null;
  if (!selectedFileItemPath.value) return null;
  return filteredFileItems.value.find(fi => fi.path === selectedFileItemPath.value) ?? null;
});

const lastClickIdx = ref(-1);
const isBatchDeleting = ref(false);

// Batch tag logic
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

const handleRenamed = async (updated: Item) => {
  selectedItem.value = updated;
  await loadAll();
};

const handleSort = (col: 'name' | 'size' | 'date') => {
  if (sortBy.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = col;
    sortDir.value = col === 'name' ? 'asc' : 'desc';
  }
};

const sortColLabels: Record<string, string> = { name: '名稱', size: '大小', date: '日期' };
const sortBtnLabel = computed(() =>
  `${sortColLabels[sortBy.value]} ${sortDir.value === 'asc' ? '↑' : '↓'}`
);

const totalCount = computed(() =>
  (props.selectedTagIds?.length ?? 0) > 0 ? itemsData.value.length : fileItems.value.length
);

const totalSizeBytes = computed(() => {
  const list = (props.selectedTagIds?.length ?? 0) > 0 ? itemsData.value : fileItems.value;
  return list.reduce((s, i) => s + (i.fileSize ?? 0), 0);
});

const totalSizeLabel = computed(() => formatSize(totalSizeBytes.value) || '—');

const filterLabel = computed(() => {
  if ((props.selectedTagIds?.length ?? 0) > 0) return '標籤篩選';
  if (gallerySearch.value.trim()) return `"${gallerySearch.value.trim()}"`;
  return '全部';
});

// View mode
const viewMode = ref<'list' | 'grid'>('list');

// Preview logic
const isPreviewOpen = ref(false);
const togglePreview = () => { isPreviewOpen.value = !isPreviewOpen.value; };
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

const loadAllWithSelected = async () => {
  const prevPath = selectedFileItemPath.value;
  await loadAll();
  if (prevPath) {
    selectedItem.value = itemByPath.value.get(prevPath) ?? null;
  } else if (props.sourcePath) {
    const folderItem = await api.getItemByPath(props.sourcePath).catch(() => null);
    if (folderItem) selectedItem.value = folderItem;
  }
};

watch(() => props.sourcePath, () => {
  selectedFileItemPath.value = null;
  selectedPaths.value = [];
  lastClickIdx.value = -1;
  loadAllWithSelected();
});

watch(() => props.selectedTagIds, async () => {
  loadAllWithSelected();
});

onMounted(() => {
  loadAllWithSelected();
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

const parentPath = computed(() => {
  if (!props.sourcePath) return null;
  const p = props.sourcePath.replace(/[/\\]+$/, '');
  const lastSep = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return lastSep > 0 ? p.slice(0, lastSep) : null;
});

const goUp = () => { if (parentPath.value) emit('navigateDir', parentPath.value); };
</script>

<template>
  <div class="main-layout">
    <div class="gallery-container">
      <div class="header">
        <GalleryToolbar
          :sourcePath="sourcePath"
          v-model:searchQuery="gallerySearch"
          :sortBy="sortBy"
          :sortDir="sortDir"
          :sortLabel="sortBtnLabel"
          v-model:viewMode="viewMode"
          :isLoading="isLoading"
          :hasParent="!!parentPath"
          @refresh="loadAllWithSelected"
          @goUp="goUp"
          @sort="handleSort(sortBy)"
        />

        <GalleryInfoBar
          v-if="sourcePath || (selectedTagIds?.length ?? 0) > 0"
          :count="filteredFileItems.length"
          :totalCount="totalCount"
          :searchQuery="gallerySearch"
          :filterLabel="filterLabel"
          :sizeLabel="totalSizeLabel"
        />
      </div>

      <div class="table-wrapper">
        <div v-if="!sourcePath && !(selectedTagIds?.length)" class="no-workspace-state">
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
          :key="'list-' + props.sourcePath + '-' + (props.selectedTagIds || []).join(',')"
          :items="filteredFileItems"
          :itemByPath="itemByPath"
          :selectedItemPath="selectedFileItemPath"
          :selectedPaths="selectedPaths"
          :searchQuery="gallerySearch"
          :sortBy="sortBy"
          :sortDir="sortDir"
          @click="handleFileItemClick"
          @dblclick="handleFileItemDblClick"
          @detail="handleContextDetail"
          @rename="handleContextRename"
          @delete="handleDelete"
          @sort="handleSort"
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

      <div class="status-bar" v-if="selectedTagIds?.length && tagTotalPages > 1">
        <div class="pagination">
          <button class="page-btn" :disabled="tagPage === 0" @click="gotoTagPage(tagPage - 1)">‹</button>
          <span class="page-info">{{ tagPage + 1 }} / {{ tagTotalPages }}</span>
          <button class="page-btn" :disabled="tagPage >= tagTotalPages - 1" @click="gotoTagPage(tagPage + 1)">›</button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="selectedPaths.length > 1" class="batch-action-bar">
        <span class="batch-count">已選取 {{ selectedPaths.length }} 項</span>
        <button class="batch-btn" @click="clearMultiSelect">取消選取</button>

        <div class="batch-tag-wrap">
          <button class="batch-btn" :disabled="isBatchTagging" @click="tagPickerMode === 'add' ? closeTagPicker() : openTagPicker('add')">
            ＋ 加標籤
          </button>
          <div v-if="tagPickerMode === 'add'" class="tag-picker-popover">
            <input
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
      :fileItem="selectedFileItem"
      :style="{ width: previewWidth + 'px', minWidth: previewWidth + 'px' }"
      @show-detail="emit('showDetail', $event)"
      @show-folder-detail="emit('showFolderDetail', $event)"
      @tag-click="emit('jumpToTag', $event.id)"
      @renamed="handleRenamed"
      @close="isPreviewOpen = false"
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
  padding: 12px 12px 0;
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
  background: var(--accent);
  width: 6px;
  box-shadow: 0 0 10px var(--accent);
}

.header { margin-bottom: 8px; }

.table-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.no-workspace-state, .loader, .empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}

.no-workspace-icon { font-size: 3rem; margin-bottom: 1rem; opacity: 0.5; }
.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid var(--border-default);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin { to { transform: rotate(360deg); } }

.status-bar {
  padding: 6px 4px 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 12px;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 6px;
}

.page-btn {
  background: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 1px 7px;
  border-radius: 4px;
  line-height: 1.4;
}
.page-btn:hover:not(:disabled) { background: var(--bg-overlay-soft); color: var(--text-primary); }
.page-btn:disabled { opacity: 0.3; cursor: default; }

.page-info { font-family: var(--font-mono); font-size: 0.75rem; }

.preview-toggle-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 60px;
  background: var(--bg-panel);
  border: 1px solid var(--border-default);
  border-right: none;
  border-radius: 8px 0 0 8px;
  color: var(--text-secondary);
  cursor: pointer;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: background 0.2s, color 0.2s;
}
.preview-toggle-btn:hover { background: var(--bg-overlay-soft); color: var(--text-primary); }

.batch-action-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-elevated);
  border: 1px solid var(--accent);
  padding: 10px 20px;
  border-radius: 50px;
  box-shadow: var(--shadow-popover);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 2000;
  animation: slideUp 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}

@keyframes slideUp { from { transform: translate(-50%, 100px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }

.batch-count { font-weight: 600; color: var(--accent); font-size: 0.9rem; margin-right: 8px; }
.batch-btn {
  background: var(--bg-overlay-soft);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  padding: 5px 14px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}
.batch-btn:hover:not(:disabled) { background: var(--bg-overlay-strong); border-color: var(--text-secondary); }
.batch-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.batch-danger { color: var(--color-danger); }
.batch-danger:hover:not(:disabled) { background: var(--color-danger-bg-subtle); border-color: var(--color-danger); }

.batch-tag-wrap { position: relative; }
.tag-picker-popover {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  width: 220px;
  box-shadow: var(--shadow-popover);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tag-picker-input {
  background: var(--bg-panel);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 6px 10px;
  font-size: 0.85rem;
  outline: none;
}
.tag-picker-input:focus { border-color: var(--accent); }
.tag-picker-list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.tag-picker-item {
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.tag-picker-item:hover { background: var(--bg-overlay-soft); color: var(--text-primary); }
.tag-picker-empty { padding: 10px; text-align: center; font-size: 0.8rem; color: var(--text-tertiary); }
</style>
