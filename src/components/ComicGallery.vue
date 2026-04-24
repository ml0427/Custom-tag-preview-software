<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { api, type Item, type FileItem } from '../api';
import PreviewPane from './PreviewPane.vue';
import FileExplorerTable from './FileExplorerTable.vue';
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

const handleFileItemClick = (item: FileItem) => {
  selectedFileItemPath.value = item.path;
  selectedItem.value = itemByPath.value.get(item.path) ?? null;
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
  try {
    await Promise.all([loadFileItems(), loadItemsBackground()]);
  } catch (e) {
    console.error(e);
  } finally {
    isLoading.value = false;
  }
};

watch(() => props.sourcePath, () => {
  selectedFileItemPath.value = null;
  loadAll();
});

watch(() => props.selectedTagId, async () => {
  isLoading.value = true;
  itemsData.value = [];
  try { await loadItemsBackground(); }
  catch (e) { console.error(e); }
  finally { isLoading.value = false; }
});

onMounted(() => loadAll());
onUnmounted(() => stopResizing());

defineExpose({ refresh: () => loadAll() });

// ── Toolbar ───────────────────────────────────────────────────────────────────

const parentPath = computed(() => {
  if (!props.sourcePath) return null;
  const norm = props.sourcePath.replace(/\\/g, '/').replace(/\/$/, '');
  const parts = norm.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : null;
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
          v-else
          :items="filteredFileItems"
          :itemByPath="itemByPath"
          :selectedItemPath="selectedFileItemPath"
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
  overflow-y: auto;
  scroll-behavior: smooth;
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
  height: 300px;
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

.table-wrapper::-webkit-scrollbar { width: 10px; }
.table-wrapper::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 10px;
}
</style>
