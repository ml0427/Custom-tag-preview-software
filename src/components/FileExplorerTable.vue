<script setup lang="ts">
import { ref, computed, reactive, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { type Item, type FileItem } from '../api';
import { formatSize } from '../utils/format';
import { useItemTypes } from '../composables/useItemTypes';
import { useToast } from '../composables/useToast';
import { useVirtualScroll } from '../composables/useVirtualScroll';
import { useContextMenu } from '../composables/useContextMenu';
import { useThumbnailLoader } from '../composables/useThumbnailLoader';
import { useFolderRuleActions } from '../composables/useFolderRuleActions';
import { useFileExplorerColumns } from '../composables/useFileExplorerColumns';

const props = defineProps<{
  items: FileItem[];
  itemByPath: Map<string, Item>;
  selectedItemPath: string | null;
  selectedPaths?: string[];
  searchQuery?: string;
  sortBy: 'name' | 'size' | 'date';
  sortDir: 'asc' | 'desc';
}>();

const emit = defineEmits<{
  (e: 'click', item: FileItem, event: MouseEvent): void;
  (e: 'dblclick', item: FileItem): void;
  (e: 'detail', item: FileItem): void;
  (e: 'rename', item: FileItem, newName: string): void;
  (e: 'delete', item: FileItem): void;
  (e: 'sort', col: 'name' | 'size' | 'date'): void;
  (e: 'addCategory', item: FileItem): void;
  (e: 'rulesApplied'): void;
}>();

const ROW_HEIGHT = 56;
const BUFFER = 15;

// Context menu
const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu<FileItem>();

// Inline rename
const editingPath = ref<string | null>(null);
const editName = ref('');

const startRename = () => {
  if (!contextMenu.value.item) return;
  editingPath.value = contextMenu.value.item.path;
  editName.value = contextMenu.value.item.name;
  hideContextMenu();
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.rename-input');
    input?.focus();
    input?.select();
  });
};

const startRenameForItem = (item: FileItem) => {
  editingPath.value = item.path;
  editName.value = item.name;
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.rename-input');
    input?.focus();
    input?.select();
  });
};

const commitRename = (item: FileItem) => {
  const newName = editName.value.trim();
  if (newName && newName !== item.name) emit('rename', item, newName);
  editingPath.value = null;
};

const cancelRename = () => { editingPath.value = null; };

const onOuterScroll = (e: Event) => {
  scrollTop.value = (e.target as HTMLDivElement).scrollTop;
};

onMounted(() => {
  if (outerRef.value) {
    outerRef.value.addEventListener('keydown', handleKeydown);
  }
});

onUnmounted(() => {
  outerRef.value?.removeEventListener('keydown', handleKeydown);
});

watch(() => props.selectedItemPath, () => {
  const idx = currentIndex.value;
  if (idx < 0) return;
  nextTick(() => scrollToIndex(idx));
});

const sortedItems = computed(() => {
  return [...props.items].sort((a, b) => {
    let cmp = 0;
    if (props.sortBy === 'name') {
      cmp = (a.name || '').localeCompare(b.name || '', 'zh-TW', { sensitivity: 'base' });
    } else if (props.sortBy === 'size') {
      cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0);
    } else if (props.sortBy === 'date') {
      cmp = (a.modifiedTime ?? '').localeCompare(b.modifiedTime ?? '');
    }
    return props.sortDir === 'asc' ? cmp : -cmp;
  });
});

const {
  outerRef,
  scrollTop,
  containerHeight,
  visibleItems,
  topSpacerHeight,
  bottomSpacerHeight,
  scrollToIndex
} = useVirtualScroll(sortedItems, ROW_HEIGHT, BUFFER);

const currentIndex = computed(() => {
  if (!props.selectedItemPath) return -1;
  return sortedItems.value.findIndex(i => i.path === props.selectedItemPath);
});

const navigateTo = (idx: number) => {
  const item = sortedItems.value[idx];
  if (!item) return;
  emit('click', item, new MouseEvent('click'));
  nextTick(() => scrollToIndex(idx));
};

const handleKeydown = (e: KeyboardEvent) => {
  if (editingPath.value) return;
  const len = sortedItems.value.length;
  if (!len) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    navigateTo(Math.min(currentIndex.value + 1, len - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    navigateTo(Math.max(currentIndex.value - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = sortedItems.value[currentIndex.value];
    if (item) emit('dblclick', item);
  } else if (e.key === 'Delete') {
    e.preventDefault();
    const item = sortedItems.value[currentIndex.value];
    if (item) emit('delete', item);
  } else if (e.key === 'F2') {
    e.preventDefault();
    const item = sortedItems.value[currentIndex.value];
    if (item) startRenameForItem(item);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideContextMenu();
  }
};

// Thumbnail loading
const thumbUrls = reactive(new Map<string, string>());
const thumbLoading = new Set<string>();
const {
  getDbItem,
  hasCategoryAssigned,
  loadThumbUrl,
  loadThumbFallbackUrl,
  logThumbDebug,
  onImgError,
} = useThumbnailLoader();

const loadThumb = async (item: FileItem) => {
  const path = item.path;
  if (thumbUrls.has(path) || thumbLoading.has(path) || item.isDir) return;
  thumbLoading.add(path);
  try {
    const url = await loadThumbUrl(item, props.itemByPath);
    if (url) thumbUrls.set(path, url);
  } finally {
    thumbLoading.delete(path);
  }
};

const handleImgError = async (item: FileItem, event: Event) => {
  onImgError(item.path);
  const failedUrl = thumbUrls.get(item.path);
  logThumbDebug('img.error.table', {
    path: item.path,
    name: item.name,
    url: failedUrl,
    eventType: event.type,
  });
  if (failedUrl?.startsWith('data:')) return;
  const fallbackUrl = await loadThumbFallbackUrl(item, props.itemByPath);
  if (fallbackUrl) {
    thumbUrls.set(item.path, fallbackUrl);
    logThumbDebug('img.fallback.table', {
      path: item.path,
      name: item.name,
      fallbackKind: fallbackUrl.startsWith('data:') ? 'base64' : 'url',
    });
  }
};

watch(visibleItems, items => {
  items.forEach(item => loadThumb(item));
}, { immediate: true });

const { getTypeConfig, itemTypes } = useItemTypes();
const { show: showToast } = useToast();
const { applyRulesForItem } = useFolderRuleActions(
  () => props.itemByPath,
  () => itemTypes.value,
  showToast,
  hideContextMenu,
  () => emit('rulesApplied')
);

const getFileIcon = (item: FileItem): string => {
  const dbItem = getDbItem(item, props.itemByPath);
  if (item.isDir) {
    return getTypeConfig(dbItem?.category).icon;
  }
  if (dbItem?.category && dbItem.category !== 'default') {
    return getTypeConfig(dbItem.category).icon;
  }
  const ext = item.extension?.toLowerCase() ?? '';
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return '🖼️';
  if (['mp4','mkv','avi','mov','wmv'].includes(ext)) return '🎬';
  if (['zip','rar','7z','cbz','cbr'].includes(ext)) return '📦';
  if (ext === 'pdf') return '📄';
  if (['mp3','flac','wav','ogg'].includes(ext)) return '🎵';
  if (ext === 'exe') return '⚙️';
  if (['txt','md'].includes(ext)) return '📝';
  return '📄';
};

const getItemTags = (item: FileItem) => {
  return getDbItem(item, props.itemByPath)?.tags ?? [];
};

const selectedSet = computed(() => new Set(props.selectedPaths ?? []));
const isSelected = (item: FileItem): boolean => selectedSet.value.has(item.path) || item.path === props.selectedItemPath;

const highlightText = (text: string | null | undefined): string => {
  if (!text) return '';
  const q = props.searchQuery?.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
};


const sortIcon = (col: string) => {
  if (props.sortBy !== col) return '';
  return props.sortDir === 'asc' ? '↑' : '↓';
};

const {
  visibleCols,
  colPickerOpen,
  colPickerRef,
  toggleCol,
  colCount,
} = useFileExplorerColumns();
</script>

<template>
  <div class="vscroll-outer" ref="outerRef" tabindex="0">
    <table class="comic-table">
      <thead class="sticky-header">
        <tr>
          <th v-if="visibleCols.has('thumb')" class="col-thumb"></th>
          <th class="col-name sortable" @click="emit('sort', 'name')">
            檔名 <span class="sort-icon">{{ sortIcon('name') }}</span>
          </th>
          <th v-if="visibleCols.has('tags')" class="col-tags">標籤</th>
          <th v-if="visibleCols.has('size')" class="col-size sortable" @click="emit('sort', 'size')">
            大小 <span class="sort-icon">{{ sortIcon('size') }}</span>
          </th>
          <th v-if="visibleCols.has('date')" class="col-date sortable" @click="emit('sort', 'date')">
            日期 <span class="sort-icon">{{ sortIcon('date') }}</span>
          </th>
          <th class="col-settings" ref="colPickerRef">
            <button class="col-settings-btn" @click="colPickerOpen = !colPickerOpen" title="欄位顯示設定">⚙</button>
            <div v-if="colPickerOpen" class="col-picker-popup" @click.stop>
              <label><input type="checkbox" :checked="visibleCols.has('thumb')" @change="toggleCol('thumb')"> 縮圖</label>
              <label><input type="checkbox" :checked="visibleCols.has('tags')" @change="toggleCol('tags')"> 標籤</label>
              <label><input type="checkbox" :checked="visibleCols.has('size')" @change="toggleCol('size')"> 大小</label>
              <label><input type="checkbox" :checked="visibleCols.has('date')" @change="toggleCol('date')"> 日期</label>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="topSpacerHeight > 0" class="spacer-row" :style="{ height: topSpacerHeight + 'px' }">
          <td :colspan="colCount"></td>
        </tr>
        <tr
          v-for="item in visibleItems"
          :key="item.path"
          :class="{ selected: isSelected(item) }"
          @click="emit('click', item, $event)"
          @dblclick="emit('dblclick', item)"
          @contextmenu.prevent="showContextMenu($event, item)"
        >
          <!-- Thumbnail -->
          <td v-if="visibleCols.has('thumb')" class="col-thumb">
            <div class="thumb-wrap">
              <img
                v-if="thumbUrls.get(item.path)"
                :src="thumbUrls.get(item.path)"
                class="thumb-img"
                draggable="false"
                @error="handleImgError(item, $event)"
              />
              <span v-else class="thumb-icon">{{ getFileIcon(item) }}</span>
            </div>
          </td>

          <!-- Name -->
          <td class="col-name">
            <div class="name-cell">
              <input
                v-if="editingPath === item.path"
                v-model="editName"
                class="rename-input"
                @keyup.enter="commitRename(item)"
                @keyup.escape="cancelRename"
                @blur="cancelRename"
                @click.stop
              />
              <span
                v-else
                class="file-title"
                :title="item.path"
                v-html="highlightText(item.name)"
              ></span>
              <span v-if="editingPath !== item.path && item.extension" class="file-meta">
                {{ item.extension.toUpperCase() }}
              </span>
            </div>
          </td>

          <!-- Tags -->
          <td v-if="visibleCols.has('tags')" class="col-tags">
            <div class="tag-chips">
              <span
                v-for="tag in getItemTags(item).slice(0, 3)"
                :key="tag.id"
                class="mini-tag"
                :style="tag.color ? { background: tag.color + '18', borderColor: tag.color + '55', color: tag.color } : {}"
              >{{ tag.name }}</span>
              <span v-if="getItemTags(item).length > 3" class="tag-more">
                +{{ getItemTags(item).length - 3 }}
              </span>
            </div>
          </td>

          <!-- Size -->
          <td v-if="visibleCols.has('size')" class="col-size">{{ item.fileSize ? formatSize(item.fileSize) : '—' }}</td>

          <!-- Date -->
          <td v-if="visibleCols.has('date')" class="col-date">{{ item.modifiedTime ?? '' }}</td>

          <!-- Settings spacer -->
          <td class="col-settings"></td>
        </tr>
        <tr v-if="bottomSpacerHeight > 0" class="spacer-row" :style="{ height: bottomSpacerHeight + 'px' }">
          <td :colspan="colCount"></td>
        </tr>
      </tbody>
    </table>
  </div>

  <Teleport to="body">
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop
    >
      <template v-if="contextMenu.item?.isDir">
        <button class="ctx-item" @click="emit('dblclick', contextMenu.item!); hideContextMenu()">進入資料夾</button>
        <button class="ctx-item" @click="emit('detail', contextMenu.item!); hideContextMenu()">{{ hasCategoryAssigned(contextMenu.item!, props.itemByPath) ? '修改類別' : '新增類別' }}</button>
        <button class="ctx-item" @click="applyRulesForItem(contextMenu.item!)">重新套用類別</button>
        <button class="ctx-item" @click="startRename">修改檔名</button>
        <div class="ctx-divider"></div>
        <button class="ctx-item ctx-danger" @click="emit('delete', contextMenu.item!); hideContextMenu()">移至資源回收筒</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="emit('detail', contextMenu.item!); hideContextMenu()">詳情/編輯標籤</button>
        <button class="ctx-item" @click="emit('addCategory', contextMenu.item!); hideContextMenu()">{{ hasCategoryAssigned(contextMenu.item!, props.itemByPath) ? '修改類別' : '新增類別' }}</button>
        <button class="ctx-item" @click="applyRulesForItem(contextMenu.item!)">重新套用類別</button>
        <button class="ctx-item" @click="startRename">修改檔名</button>
        <div class="ctx-divider"></div>
        <button class="ctx-item ctx-danger" @click="emit('delete', contextMenu.item!); hideContextMenu()">移至資源回收筒</button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.vscroll-outer {
  width: 100%;
  height: 100%; /* 改用 100% 配合父層 flex */
  overflow-y: auto;
  outline: none;
  background: var(--bg-panel);
  position: relative;
  isolation: isolate; /* 隔離 sticky-header stacking context，避免 row hit-test 穿透 */
}

.vscroll-outer::-webkit-scrollbar { width: 4px; }
.vscroll-outer::-webkit-scrollbar-thumb {
  background: var(--bg-overlay-strong);
  border-radius: 10px;
}

.comic-table {
  width: 100%;
  /* separate + 0 spacing 修復 sticky <th> 在 webkit/blink 下的 hit-test 漏洞，
     避免 hover 落到捲出畫面的 row 觸發其 :title tooltip */
  border-collapse: separate;
  border-spacing: 0;
  text-align: left;
  table-layout: fixed;
}

.comic-table th {
  position: sticky;
  top: 0;
  background: var(--bg-panel);
  background-clip: padding-box;
  padding: 12px 8px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  z-index: 50;
  border-bottom: 1px solid var(--border-strong);
  user-select: none;
}

.sticky-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--bg-panel);
}
.comic-table th.sortable { cursor: pointer; user-select: none; }
.comic-table th.sortable:hover { color: var(--text-primary); background: var(--bg-overlay-soft); }

.sort-icon { opacity: 0.8; }

.comic-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 0.92rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}

.comic-table tr { cursor: default; transition: background 0.15s; }
.comic-table tr:hover { background: var(--bg-overlay-soft); }
.comic-table tr.selected { background: var(--accent-bg-subtle) !important; }
.spacer-row td { padding: 0; border: none; }
.comic-table tr.selected td:first-child { box-shadow: inset 2px 0 0 var(--accent); }

/* Column widths */
.col-thumb    { width: 5%; min-width: 52px; padding: 8px; }
.col-name     { width: 38%; }
.col-tags     { width: 22%; }
.col-size     { width: 10%; min-width: 64px; text-align: right; font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }
.col-date     { width: 15%; min-width: 100px; font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }
.col-settings { width: 5%; min-width: 36px; text-align: center; position: relative; padding: 4px; }

.col-settings-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 4px;
  line-height: 1;
  transition: color 0.15s, background 0.15s;
}
.col-settings-btn:hover { color: var(--text-primary); background: var(--bg-overlay-soft); }

.col-picker-popup {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 200;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 8px 4px;
  min-width: 120px;
  box-shadow: var(--shadow-popover);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.col-picker-popup label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--text-primary);
  font-weight: normal;
  text-transform: none;
  letter-spacing: 0;
  transition: background 0.15s;
}
.col-picker-popup label:hover { background: var(--bg-overlay-soft); }
.col-picker-popup input[type="checkbox"] { accent-color: var(--accent); cursor: pointer; }

/* Thumbnail */
.thumb-wrap {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-overlay-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-icon { font-size: 1.1rem; }

/* Name cell */
.name-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: hidden;
}
.file-title {
  font-family: var(--font-jp);
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tags */
.tag-chips { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; overflow: hidden; }

.mini-tag {
  font-family: var(--font-jp);
  font-size: 10px;
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  flex-shrink: 0;
  background: var(--accent-bg-subtle);
  border: 1px solid var(--accent-border);
  color: var(--accent);
}
.mini-tag::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
  flex-shrink: 0;
}
.tag-more { font-size: 0.72rem; color: var(--text-tertiary); flex-shrink: 0; }

/* Rename */
.rename-input {
  background: var(--bg-overlay-strong);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.92rem;
  padding: 2px 6px;
  outline: none;
  width: 100%;
}

/* Context menu */
.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 4px;
  min-width: 160px;
  box-shadow: var(--shadow-popover);
}
.ctx-item {
  display: block;
  width: 100%;
  padding: 8px 14px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}
.ctx-item:hover { background: var(--bg-overlay-strong); }
.ctx-divider { height: 1px; background: var(--border-default); margin: 3px 4px; }
.ctx-danger { color: var(--color-danger); }
.ctx-danger:hover { background: var(--color-danger-bg-subtle); color: var(--color-danger); }

:deep(mark) {
  background: var(--color-warning);
  color: var(--text-primary);
  border-radius: 2px;
  padding: 0 1px;
}
</style>
