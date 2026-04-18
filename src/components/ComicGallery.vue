<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, nextTick } from 'vue';
import { api, type Comic, type Page } from '../api';
import PreviewPane from './PreviewPane.vue';

const props = defineProps<{
  selectedTagId: number | null
  sourcePath: string | null
}>();

const emit = defineEmits<{
  (e: 'showDetail', comic: Comic): void
}>();

const comicsPage = ref<Page<Comic> | null>(null);
const isLoading = ref(false);
const currentPage = ref(0);
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
    loadComics(0);
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

    if (!comicsPage.value || comicsPage.value.content.length === 0) return;

    const content = comicsPage.value.content;
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

const loadComics = async (page: number) => {
    isLoading.value = true;
    try {
        const res = await api.getComics(page, 20, props.selectedTagId ?? undefined, sortBy.value, sortDir.value, props.sourcePath ?? undefined);
        comicsPage.value = res;
        currentPage.value = page;
        
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

const formatSize = (bytes: number) => {
    if (!bytes) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-TW');
};

watch(() => [props.selectedTagId, props.sourcePath], () => {
    selectedComic.value = null;
    loadComics(0);
});

onMounted(() => {
    loadComics(0);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', closeContextMenu);
});

onUnmounted(() => {
    stopResizing();
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('click', closeContextMenu);
});


const handlePrev = () => {
    if (currentPage.value > 0) loadComics(currentPage.value - 1);
};

const handleNext = () => {
    if (comicsPage.value && currentPage.value < comicsPage.value.totalPages - 1) {
        loadComics(currentPage.value + 1);
    }
};

defineExpose({
    refresh: () => loadComics(currentPage.value)
});
</script>

<template>
  <div class="main-layout">
    <div class="gallery-container">
      <div class="header">
        <div class="title-group">
            <h2>📚 收藏庫</h2>
            <span v-if="comicsPage" class="count-badge">{{ comicsPage.totalElements }} 項目</span>
        </div>
        <div v-if="comicsPage" class="pagination">
          <button class="btn-icon" @click="handlePrev" :disabled="currentPage === 0 || isLoading">◀</button>
          <span class="page-info">{{ currentPage + 1 }} / {{ comicsPage.totalPages || 1 }}</span>
          <button class="btn-icon" @click="handleNext" :disabled="!comicsPage || currentPage >= comicsPage.totalPages - 1 || isLoading">▶</button>
        </div>
      </div>
      
      <div class="table-wrapper" ref="tableWrapperRef">
        <div v-if="isLoading" class="loader">
          <div class="spinner"></div>
          <p>載入中...</p>
        </div>
        
        <div v-else-if="comicsPage?.content.length === 0" class="empty-state">
          <h3>沒有找到相關記錄 🥺</h3>
          <p>請嘗試切換標籤，或執行掃描功能。</p>
        </div>
        
        <table v-else class="comic-table">
          <thead>
            <tr>
              <th class="col-name sortable" @click="toggleSort('title')">名稱 {{ sortIcon('title') }}</th>
              <th class="col-size sortable" @click="toggleSort('file_size')">大小 {{ sortIcon('file_size') }}</th>
              <th class="col-date sortable" @click="toggleSort('file_modified_time')">修改日期 {{ sortIcon('file_modified_time') }}</th>
              <th class="col-tags">標籤</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="comic in comicsPage?.content"
              :key="comic.id"
              :class="{ 'selected': selectedComic?.id === comic.id, 'is-editing-row': editingComicId === comic.id }"
              @click="selectComic(comic)"
              @dblclick="handleDblClick(comic)"
              @contextmenu.prevent="handleContextMenu(comic, $event)"
            >
              <td class="col-name">
                <div class="file-info">
                  <!-- Inline Rename UI -->
                  <div v-if="editingComicId === comic.id" class="inline-edit-wrapper">
                      <input
                        v-model="editTitle"
                        class="inline-edit-input"
                        @click.stop
                        @keydown.enter="submitRename(comic)"
                        @keydown.esc="cancelRename"
                        @blur="submitRename(comic)"
                      />
                  </div>
                  <span v-else class="file-title" :title="comic.title">{{ comic.title }}</span>
                </div>
              </td>
              <td class="col-size">{{ formatSize(comic.fileSize) }}</td>
              <td class="col-date">{{ formatDate(comic.fileModifiedTime || comic.importTime) }}</td>
              <td class="col-tags">
                <div class="tag-chips">
                  <span v-for="tag in comic.tags.slice(0, 3)" :key="tag.id" class="mini-tag">
                    {{ tag.name }}
                  </span>
                  <span v-if="comic.tags.length > 3" class="tag-more">+{{ comic.tags.length - 3 }}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 12px 24px;
  background: var(--panel-bg);
  backdrop-filter: var(--glass-blur);
  border-radius: 12px;
  border: 1px solid var(--panel-border);
}

.title-group {
    display: flex;
    align-items: center;
    gap: 12px;
}

.count-badge {
    background: rgba(255,255,255,0.1);
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 0.8rem;
    color: var(--text-secondary);
}

.pagination {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-icon {
    background: transparent;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 1rem;
    padding: 5px 10px;
    border-radius: 6px;
    transition: background 0.2s;
}

.btn-icon:hover:not(:disabled) {
    background: rgba(255,255,255,0.1);
}

.btn-icon:disabled {
    opacity: 0.3;
}

.page-info {
    font-weight: 600;
    min-width: 80px;
    text-align: center;
}

.table-wrapper {
  flex: 1;
  background: var(--panel-bg);
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  overflow-y: auto;
  backdrop-filter: var(--glass-blur);
  scroll-behavior: smooth;
}

.comic-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    table-layout: fixed;
}

.comic-table th {
    position: sticky;
    top: 0;
    background: rgba(30,30,35,0.95);
    z-index: 10;
    padding: 12px 16px;
    font-size: 0.85rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--panel-border);
    white-space: nowrap;
}

.comic-table th.sortable {
    cursor: pointer;
    user-select: none;
}

.comic-table th.sortable:hover {
    color: var(--text-primary);
    background: rgba(255,255,255,0.05);
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

.comic-table td {
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    font-size: 0.95rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.comic-table tr {
    cursor: default;
    transition: background 0.2s;
}

.comic-table tr:hover {
    background: rgba(255,255,255,0.03);
}

.comic-table tr.selected {
    background: var(--accent-color-transparent) !important;
}

.col-name { width: 45%; }
.col-size { width: 12%; }
.col-date { width: 18%; }
.col-tags { width: 25%; }

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

.file-info {
    display: flex;
    align-items: center;
    gap: 10px;
}

.inline-edit-wrapper {
    flex: 1;
}

.inline-edit-input {
    width: 100%;
    background: rgba(0,0,0,0.4);
    border: 1px solid var(--accent-color);
    border-radius: 4px;
    color: #fff;
    padding: 4px 8px;
    font-size: 0.95rem;
    outline: none;
}

.file-title {
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
}

.tag-chips {
    display: flex;
    gap: 6px;
    align-items: center;
}

.mini-tag {
    background: rgba(255,255,255,0.08);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--text-secondary);
}

.tag-more {
    font-size: 0.75rem;
    color: var(--accent-color);
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
    width: 6px;
}
.table-wrapper::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.1);
    border-radius: 10px;
}
</style>
