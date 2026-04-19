<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted, nextTick } from 'vue';
import { api, type Comic, type Folder, type FileItem, type Page } from '../api';
import PreviewPane from './PreviewPane.vue';
import FileExplorerTable from './FileExplorerTable.vue';
import ComicFilterTable from './ComicFilterTable.vue';

const props = defineProps<{
  selectedTagId: number | null
  sourcePath: string | null
}>();

const emit = defineEmits<{
  (e: 'showDetail', comic: Comic): void;
  (e: 'showFolderDetail', folder: Folder): void;
  (e: 'navigateDir', path: string): void;
}>();

const comicsPage = ref<Page<Comic> | null>(null);
const folders = ref<Folder[]>([]);
const fileItems = ref<FileItem[]>([]);
const isLoading = ref(false);
const gallerySearch = ref('');

// 當 sourcePath 有值時進入檔案總管模式
const showExplorerMode = computed(() => props.sourcePath !== null);

const filteredComics = computed(() => {
  const all = comicsPage.value?.content ?? [];
  const q = gallerySearch.value.trim().toLowerCase();
  if (!q) return all;
  return all.filter(c => c.title.toLowerCase().includes(q));
});

const filteredFolders = computed(() => {
  const q = gallerySearch.value.trim().toLowerCase();
  if (!q) return folders.value;
  return folders.value.filter(f => f.name.toLowerCase().includes(q));
});

const filteredFileItems = computed(() => {
  const q = gallerySearch.value.trim().toLowerCase();
  if (!q) return fileItems.value;
  return fileItems.value.filter(item => item.name.toLowerCase().includes(q));
});

// O(1) 路徑查詢 Map，避免每行 O(n) 掃描
const comicByPath = computed(() =>
  new Map((comicsPage.value?.content ?? []).map(c => [c.filePath, c]))
);
const folderByPath = computed(() =>
  new Map(folders.value.map(f => [f.path, f]))
);

const getComicForFile = (item: FileItem): Comic | undefined =>
  comicByPath.value.get(item.path);
const getFolderForFile = (item: FileItem): Folder | undefined =>
  folderByPath.value.get(item.path);


const selectedFileItemPath = ref<string | null>(null);

const handleFileItemClick = (item: FileItem) => {
  selectedFileItemPath.value = item.path;
  const comic = getComicForFile(item);
  if (comic) selectedComic.value = comic;
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


const selectedFolder = ref<Folder | null>(null);

const handleFolderClick = async (folder: Folder) => {
  selectedFolder.value = folder;
  if (folder.folderType !== 'comic') {
    await api.openFile(folder.path);
  }
};

const loadFolders = async () => {
  folders.value = await api.getFolders(props.selectedTagId ?? undefined);
};

const loadFileItems = async () => {
  if (!props.sourcePath) { fileItems.value = []; return; }
  try {
    fileItems.value = await api.listDirFiles(props.sourcePath);
  } catch {
    fileItems.value = [];
  }
};
const selectedComic = ref<Comic | null>(null);
const tableWrapperRef = ref<HTMLElement | null>(null);

// Editing Logic
const editingComicId = ref<number | null>(null);
const editTitle = ref('');
const isSaving = ref(false);

// Context Menu
const contextMenu = ref({ visible: false, x: 0, y: 0, comic: null as Comic | null });

const handleContextMenu = (comic: Comic, e: MouseEvent) => {
    contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, comic };
};

const closeContextMenu = () => {
    contextMenu.value.visible = false;
};

const contextMenuRename = () => {
    if (contextMenu.value.comic) startRename(contextMenu.value.comic);
    closeContextMenu();
};

const startRename = (comic: Comic) => {
    editingComicId.value = comic.id;
    editTitle.value = comic.title;
    nextTick(() => {
        const input = document.querySelector('.inline-edit-input') as HTMLInputElement;
        input?.focus();
        input?.select();
    });
};

const cancelRename = () => {
    editingComicId.value = null;
    editTitle.value = '';
};

const submitRename = async (comic: Comic) => {
    if (isSaving.value) return;
    const trimmed = editTitle.value.trim();
    if (!trimmed || trimmed === comic.title) {
        cancelRename();
        return;
    }

    isSaving.value = true;
    try {
        const updated = await api.renameComic(comic.id, trimmed);
        if (comicsPage.value) {
            const idx = comicsPage.value.content.findIndex(c => c.id === comic.id);
            if (idx !== -1) comicsPage.value.content[idx] = updated;
        }
        if (selectedComic.value?.id === comic.id) {
            selectedComic.value = updated;
        }
        cancelRename();
    } catch (e: any) {
        alert('修改名稱失敗: ' + e.message);
    } finally {
        isSaving.value = false;
    }
};

// Sorting
const sortBy = ref('import_time');
const sortDir = ref<'asc' | 'desc'>('desc');

const toggleSort = (col: string) => {
    if (sortBy.value === col) {
        sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortBy.value = col;
        sortDir.value = 'desc';
    }
    loadComics();
};

const sortIcon = (col: string) => {
    if (sortBy.value !== col) return '↕';
    return sortDir.value === 'asc' ? '↑' : '↓';
};

// Preview toggle
const isPreviewOpen = ref(false);

const togglePreview = () => {
    isPreviewOpen.value = !isPreviewOpen.value;
};

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

// Keyboard Navigation
const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'F2' && selectedComic.value && editingComicId.value === null) {
        e.preventDefault();
        startRename(selectedComic.value);
        return;
    }

    if (editingComicId.value !== null) {
        if (e.key === 'Escape') cancelRename();
        return;
    }

    if (filteredComics.value.length === 0) return;

    const content = filteredComics.value;
    const currentIndex = selectedComic.value 
        ? content.findIndex(c => c.id === selectedComic.value?.id) 
        : -1;

    let nextIndex = -1;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = currentIndex < content.length - 1 ? currentIndex + 1 : 0;
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = currentIndex > 0 ? currentIndex - 1 : content.length - 1;
    } else if (e.key === 'Enter' && selectedComic.value) {
        e.preventDefault();
        emit('showDetail', selectedComic.value);
        return;
    }

    if (nextIndex !== -1) {
        selectAndScroll(content[nextIndex]);
    }
};

const selectAndScroll = (comic: Comic) => {
    selectedComic.value = comic;
    
    nextTick(() => {
        const selectedRow = document.querySelector('.comic-table tr.selected');
        if (selectedRow && tableWrapperRef.value) {
            const container = tableWrapperRef.value;
            const rowTop = (selectedRow as HTMLElement).offsetTop;
            const rowBottom = rowTop + (selectedRow as HTMLElement).offsetHeight;
            const containerTop = container.scrollTop;
            const containerBottom = containerTop + container.offsetHeight;
            const headerHeight = 45;

            if (rowTop < containerTop + headerHeight) {
                container.scrollTop = rowTop - headerHeight;
            } else if (rowBottom > containerBottom) {
                container.scrollTop = rowBottom - container.offsetHeight;
            }
        }
    });
};

const loadComics = async () => {
    isLoading.value = true;
    try {
        const res = await api.getComics(0, 9999, props.selectedTagId ?? undefined, sortBy.value, sortDir.value, props.sourcePath ?? undefined);
        comicsPage.value = res;

        if (res.content.length > 0 && !selectedComic.value) {
            selectedComic.value = res.content[0];
        } else if (selectedComic.value) {
            const found = res.content.find(c => c.id === selectedComic.value?.id);
            if (found) selectedComic.value = found;
        }
    } catch (e) {
        console.error(e);
    } finally {
        isLoading.value = false;
    }
};

const handleRenamed = (updated: Comic) => {
    selectedComic.value = updated;
    if (comicsPage.value) {
        const index = comicsPage.value.content.findIndex(c => c.id === updated.id);
        if (index !== -1) {
            comicsPage.value.content[index] = updated;
        }
    }
};

const selectComic = (comic: Comic) => {
    selectedComic.value = comic;
};

const handleDblClick = (comic: Comic) => {
    emit('showDetail', comic);
};


watch(() => [props.selectedTagId, props.sourcePath], () => {
    selectedComic.value = null;
    loadComics();
    loadFolders();
    loadFileItems();
});

onMounted(() => {
    loadComics();
    loadFolders();
    loadFileItems();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', closeContextMenu);
});

onUnmounted(() => {
    stopResizing();
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('click', closeContextMenu);
});


defineExpose({
    refresh: () => { loadComics(); loadFolders(); loadFileItems(); }
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
          <span class="search-count">
            <template v-if="showExplorerMode">
              <template v-if="gallerySearch.trim()">{{ filteredFileItems.length }} / {{ fileItems.length }} 項</template>
              <template v-else>{{ fileItems.length }} 項</template>
            </template>
            <template v-else>
              <template v-if="gallerySearch.trim()">{{ filteredComics.length + filteredFolders.length }} / {{ (comicsPage?.totalElements ?? 0) + folders.length }} 項</template>
              <template v-else>{{ (comicsPage?.totalElements ?? 0) + folders.length }} 項</template>
            </template>
          </span>
        </div>
      </div>
      
      <div class="table-wrapper" ref="tableWrapperRef">
        <div v-if="isLoading" class="loader">
          <div class="spinner"></div>
          <p>載入中...</p>
        </div>
        
        <!-- 空狀態 -->
        <div v-else-if="showExplorerMode ? filteredFileItems.length === 0 : (filteredComics.length === 0 && filteredFolders.length === 0)" class="empty-state">
          <h3>沒有找到相關記錄 🥺</h3>
          <p>請嘗試切換標籤，或執行掃描功能。</p>
        </div>

        <!-- ── 檔案總管模式（sourcePath 已選） ── -->
        <FileExplorerTable
          v-else-if="showExplorerMode && filteredFileItems.length > 0"
          :items="filteredFileItems"
          :comicByPath="comicByPath"
          :folderByPath="folderByPath"
          :selectedItemPath="selectedFileItemPath"
          @click="handleFileItemClick"
          @dblclick="handleFileItemDblClick"
        />

        <!-- ── 標籤篩選模式（無 sourcePath） ── -->
        <ComicFilterTable
          v-else-if="!showExplorerMode && (filteredComics.length > 0 || filteredFolders.length > 0)"
          :comics="filteredComics"
          :folders="filteredFolders"
          :selectedComicId="selectedComic?.id ?? null"
          :selectedFolderId="selectedFolder?.id ?? null"
          :editingComicId="editingComicId"
          :editTitle="editTitle"
          :sortBy="sortBy"
          :sortDir="sortDir"
          @selectComic="selectComic"
          @dblclickComic="handleDblClick"
          @contextmenu="handleContextMenu"
          @sort="toggleSort"
          @folderClick="handleFolderClick"
          @folderDblclick="(f) => emit('showFolderDetail', f)"
          @update:editTitle="(v) => { editTitle = v }"
          @submitRename="submitRename"
          @cancelRename="cancelRename"
        />
      </div>
      <div class="status-bar">
        <span>{{ showExplorerMode ? filteredFileItems.length : (filteredComics.length + filteredFolders.length) }} 個項目</span>
      </div>

    </div>

    <!-- Right-click Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="contextMenuRename">✏️ 重新命名</div>
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


.context-menu {
    position: fixed;
    z-index: 9999;
    background: #1e2230;
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 4px 0;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    min-width: 140px;
}

.context-menu-item {
    padding: 9px 16px;
    font-size: 0.9rem;
    cursor: pointer;
    color: var(--text-secondary);
    transition: background 0.15s, color 0.15s;
}

.context-menu-item:hover {
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

.table-wrapper::-webkit-scrollbar {
    width: 10px;
}
.table-wrapper::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.1);
    border-radius: 10px;
}

</style>
