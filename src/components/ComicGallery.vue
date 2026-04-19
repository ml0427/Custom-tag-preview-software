<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { api, type Comic, type Folder, type FileItem } from '../api';
import PreviewPane from './PreviewPane.vue';
import FileExplorerTable from './FileExplorerTable.vue';

const props = defineProps<{
  sourcePath: string | null
}>();

const emit = defineEmits<{
  (e: 'showDetail', comic: Comic): void;
  (e: 'showFolderDetail', folder: Folder): void;
  (e: 'navigateDir', path: string): void;
}>();

const folders = ref<Folder[]>([]);
const fileItems = ref<FileItem[]>([]);
const comicsData = ref<Comic[]>([]);
const isLoading = ref(false);
const gallerySearch = ref('');

const filteredFileItems = computed(() => {
  const q = gallerySearch.value.trim().toLowerCase();
  if (!q) return fileItems.value;
  return fileItems.value.filter(item => item.name.toLowerCase().includes(q));
});

const comicByPath = computed(() =>
  new Map(comicsData.value.map(c => [c.filePath, c]))
);
const folderByPath = computed(() =>
  new Map(folders.value.map(f => [f.path, f]))
);

const getComicForFile = (item: FileItem): Comic | undefined =>
  comicByPath.value.get(item.path);

const selectedFileItemPath = ref<string | null>(null);
const selectedComic = ref<Comic | null>(null);
const selectedFolder = ref<Folder | null>(null);
const tableWrapperRef = ref<HTMLElement | null>(null);

const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '');

// 目前瀏覽的目錄本身或其祖先是否為漫畫類型（處理路徑格式差異與深層瀏覽）
const sourceFolderIsComic = computed(() => {
  if (!props.sourcePath) return false;
  const src = normPath(props.sourcePath);
  for (const folder of folderByPath.value.values()) {
    if (folder.folderType !== 'comic') continue;
    const fp = normPath(folder.path);
    if (src === fp || src.startsWith(fp + '/')) return true;
  }
  return false;
});

const handleFileItemClick = (item: FileItem) => {
  selectedFileItemPath.value = item.path;
  if (item.isDir) {
    const folder = getFolderForFile(item);
    const isComicDir = folder?.folderType === 'comic' || sourceFolderIsComic.value;
    if (isComicDir) {
      // 若子資料夾沒有個別登錄，建立一個暫時物件供預覽使用
      selectedFolder.value = folder ?? {
        id: -1, path: item.path, name: item.name,
        folderType: 'comic', note: '', createdAt: '', tags: [],
      } as Folder;
      selectedComic.value = null;
    }
  } else {
    selectedFolder.value = null;
    const comic = getComicForFile(item);
    selectedComic.value = comic ?? null;
  }
};

const handleFileItemDblClick = (item: FileItem) => {
  if (item.isDir) {
    emit('navigateDir', item.path);
  } else {
    const comic = getComicForFile(item);
    if (comic) {
      emit('showDetail', comic);
    } else {
      api.openFile(item.path);
    }
  }
};

const loadFolders = async () => {
  folders.value = await api.getFolders();
};

const loadFileItems = async () => {
  if (!props.sourcePath) { fileItems.value = []; return; }
  try {
    fileItems.value = await api.listDirFiles(props.sourcePath);
  } catch {
    fileItems.value = [];
  }
};

const loadComicsBackground = async () => {
  try {
    const res = await api.getComics(0, 9999, undefined, 'import_time', 'desc', props.sourcePath ?? undefined);
    comicsData.value = res.content;
  } catch {
    comicsData.value = [];
  }
};

const handleRenamed = (updated: Comic) => {
  selectedComic.value = updated;
  const idx = comicsData.value.findIndex(c => c.id === updated.id);
  if (idx !== -1) comicsData.value[idx] = updated;
};

// Preview toggle
const isPreviewOpen = ref(false);
const togglePreview = () => { isPreviewOpen.value = !isPreviewOpen.value; };

// Resizing logic
const previewWidth = ref(350);
const isResizing = ref(false);
const minWidth = 200;
const maxWidth = 600;

const startResizing = (e: MouseEvent) => {
  isResizing.value = true;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', stopResizing);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isResizing.value) return;
  const newWidth = window.innerWidth - e.clientX;
  if (newWidth >= minWidth && newWidth <= maxWidth) {
    previewWidth.value = newWidth;
  }
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
  folders.value = [];
  comicsData.value = [];
  selectedFolder.value = null;
  try {
    await Promise.all([loadFolders(), loadFileItems(), loadComicsBackground()]);
  } catch (e) {
    console.error(e);
  } finally {
    isLoading.value = false;
  }
};

watch(() => props.sourcePath, () => {
  selectedComic.value = null;
  selectedFileItemPath.value = null;
  loadAll();
});

onMounted(() => {
  loadAll();
});

onUnmounted(() => {
  stopResizing();
});

defineExpose({
  refresh: () => loadAll()
});
</script>

<template>
  <div class="main-layout">
    <div class="gallery-container">
      <div class="header">
        <div class="search-bar-wrap">
          <span class="search-icon">🔍</span>
          <input
            v-model="gallerySearch"
            class="gallery-search"
            placeholder="搜尋名稱..."
          />
          <span class="search-count" v-if="sourcePath">
            <template v-if="gallerySearch.trim()">{{ filteredFileItems.length }} / {{ fileItems.length }} 項</template>
            <template v-else>{{ fileItems.length }} 項</template>
          </span>
        </div>
      </div>

      <div class="table-wrapper" ref="tableWrapperRef">
        <!-- 未選工作目錄 -->
        <div v-if="!sourcePath" class="no-workspace-state">
          <div class="no-workspace-icon">📂</div>
          <p>請從左側選擇工作目錄</p>
        </div>

        <!-- 載入中 -->
        <div v-else-if="isLoading" class="loader">
          <div class="spinner"></div>
          <p>載入中...</p>
        </div>

        <!-- 空目錄 -->
        <div v-else-if="filteredFileItems.length === 0" class="empty-state">
          <h3>此目錄沒有任何檔案</h3>
        </div>

        <!-- 檔案列表 -->
        <FileExplorerTable
          v-else
          :items="filteredFileItems"
          :comicByPath="comicByPath"
          :folderByPath="folderByPath"
          :selectedItemPath="selectedFileItemPath"
          @click="handleFileItemClick"
          @dblclick="handleFileItemDblClick"
        />
      </div>

      <div class="status-bar">
        <span v-if="sourcePath">{{ filteredFileItems.length }} 個項目</span>
      </div>
    </div>

    <!-- Preview Toggle Button -->
    <button class="preview-toggle-btn" @click="togglePreview" :title="isPreviewOpen ? '收起預覽' : '展開預覽'">
      {{ isPreviewOpen ? '›' : '‹' }}
    </button>

    <!-- Draggable Resizer -->
    <div
      v-if="isPreviewOpen"
      class="resizer"
      :class="{ 'is-resizing': isResizing }"
      @mousedown="startResizing"
    ></div>

    <!-- Preview Pane -->
    <PreviewPane
      v-if="isPreviewOpen"
      :comic="selectedComic"
      :folder="selectedFolder"
      :style="{ width: previewWidth + 'px', minWidth: previewWidth + 'px' }"
      @show-detail="emit('showDetail', $event)"
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

.header {
  margin-bottom: 20px;
}

.search-bar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--panel-bg);
  border-radius: 12px;
  border: 1px solid var(--panel-border);
}

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
  width: 20px;
  flex-shrink: 0;
  background: var(--panel-bg);
  border: none;
  border-left: 1px solid var(--panel-border);
  color: var(--text-secondary);
  font-size: 1.2rem;
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

@keyframes spin {
  to { transform: rotate(360deg); }
}

.table-wrapper::-webkit-scrollbar { width: 10px; }
.table-wrapper::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 10px;
}
</style>
