<script setup lang="ts">
import { ref, computed, reactive, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { api, type Item, type FileItem } from '../api';
import { formatSize } from '../utils/format';
import { useItemTypes } from '../composables/useItemTypes';
import { useToast } from '../composables/useToast';

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
}>();

const ROW_HEIGHT = 56;
const BUFFER = 15;

// Context menu
const contextMenu = ref<{ visible: boolean; x: number; y: number; item: FileItem | null }>({
  visible: false, x: 0, y: 0, item: null,
});

const showContextMenu = (e: MouseEvent, item: FileItem) => {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, item };
};

const hideContextMenu = () => { contextMenu.value.visible = false; };

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

// Keyboard navigation
const outerRef = ref<HTMLDivElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(0);

const currentIndex = computed(() => {
  if (!props.selectedItemPath) return -1;
  return sortedItems.value.findIndex(i => i.path === props.selectedItemPath);
});

const scrollToIndex = (idx: number) => {
  if (!outerRef.value) return;
  const rowTop = idx * ROW_HEIGHT;
  const rowBottom = rowTop + ROW_HEIGHT;
  const { scrollTop: st, clientHeight: ch } = outerRef.value;
  if (rowTop < st) outerRef.value.scrollTop = rowTop;
  else if (rowBottom > st + ch) outerRef.value.scrollTop = rowBottom - ch;
};

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

const onOuterScroll = (e: Event) => {
  scrollTop.value = (e.target as HTMLDivElement).scrollTop;
};

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  document.addEventListener('click', hideContextMenu);
  if (outerRef.value) {
    containerHeight.value = outerRef.value.clientHeight;
    outerRef.value.addEventListener('scroll', onOuterScroll, { passive: true });
    outerRef.value.addEventListener('keydown', handleKeydown);
    resizeObserver = new ResizeObserver(entries => {
      containerHeight.value = entries[0].contentRect.height;
    });
    resizeObserver.observe(outerRef.value);
  }
});

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu);
  outerRef.value?.removeEventListener('scroll', onOuterScroll);
  outerRef.value?.removeEventListener('keydown', handleKeydown);
  resizeObserver?.disconnect();
});

watch(() => props.selectedItemPath, () => {
  const idx = currentIndex.value;
  if (idx < 0) return;
  nextTick(() => scrollToIndex(idx));
});

// 當 items 改變時，重新測量高度並將滾動歸零
watch(() => props.items, () => {
  scrollTop.value = 0;
  if (outerRef.value) outerRef.value.scrollTop = 0;
  nextTick(() => {
    if (outerRef.value) {
      containerHeight.value = outerRef.value.clientHeight;
    }
  });
}, { deep: false });

// Virtual scroll
const visibleStart = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - BUFFER));
const visibleEnd = computed(() => Math.min(
  sortedItems.value.length,
  Math.ceil((scrollTop.value + containerHeight.value) / ROW_HEIGHT) + BUFFER
));
const visibleItems = computed(() => sortedItems.value.slice(visibleStart.value, visibleEnd.value));
const topSpacerHeight = computed(() => visibleStart.value * ROW_HEIGHT);
const bottomSpacerHeight = computed(() => (sortedItems.value.length - visibleEnd.value) * ROW_HEIGHT);

// Thumbnail loading
const thumbUrls = reactive(new Map<string, string>());
const thumbLoading = new Set<string>();
const ARCHIVE_EXTS = new Set(['zip', 'cbz', 'cbr', 'rar', '7z']);
const IMAGE_EXTS_THUMB = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

const loadThumb = async (item: FileItem) => {
  const path = item.path;
  if (thumbUrls.has(path) || thumbLoading.has(path) || item.isDir) return;
  thumbLoading.add(path);
  try {
    const dbItem = props.itemByPath.get(path);
    let url = '';
    if (dbItem?.id) {
      url = await api.getCoverBase64(dbItem.id).catch(() => '');
    } else {
      const ext = item.extension?.toLowerCase() ?? '';
      if (ARCHIVE_EXTS.has(ext)) {
        url = await api.getZipCoverByPath(path).catch(() => '');
      } else if (IMAGE_EXTS_THUMB.has(ext)) {
        url = await api.getImageBase64ByPath(path).catch(() => '');
      }
    }
    if (url) thumbUrls.set(path, url);
  } finally {
    thumbLoading.delete(path);
  }
};

watch(visibleItems, items => {
  items.forEach(item => loadThumb(item));
}, { immediate: true });

const { getTypeConfig, itemTypes } = useItemTypes();
const { show: showToast } = useToast();

const applyRulesForFolder = async (item: FileItem) => {
  hideContextMenu();
  const dbItem = props.itemByPath.get(item.path);
  if (!dbItem) return;
  const type = itemTypes.value.find(t => t.name === (dbItem.category ?? 'default'));
  if (!type?.tagRules?.length) { showToast('此類別沒有設定掃描規則', 'info'); return; }
  try {
    const result = await api.applyTagScan(item.path, type.tagRules);
    showToast(`已套用 ${result.tagged} 個標籤`, 'success');
  } catch (e) { showToast('套用失敗: ' + String(e), 'error'); }
};

const getFileIcon = (item: FileItem): string => {
  if (item.isDir) {
    const ft = props.itemByPath.get(item.path)?.category;
    return getTypeConfig(ft).icon;
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
  return props.itemByPath.get(item.path)?.tags ?? [];
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

const sortIcon = (col: string) => {
  if (props.sortBy !== col) return '';
  return props.sortDir === 'asc' ? '↑' : '↓';
};
</script>

<template>
  <div class="vscroll-outer" ref="outerRef" tabindex="0">
    <table class="comic-table">
      <thead>
        <tr>
          <th class="col-thumb"></th>
          <th class="col-name sortable" @click="emit('sort', 'name')">
            檔名 <span class="sort-icon">{{ sortIcon('name') }}</span>
          </th>
          <th class="col-tags">標籤</th>
          <th class="col-size sortable" @click="emit('sort', 'size')">
            大小 <span class="sort-icon">{{ sortIcon('size') }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="topSpacerHeight > 0" class="spacer-row" :style="{ height: topSpacerHeight + 'px' }">
          <td colspan="4"></td>
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
          <td class="col-thumb">
            <div class="thumb-wrap">
              <img
                v-if="thumbUrls.get(item.path)"
                :src="thumbUrls.get(item.path)"
                class="thumb-img"
                draggable="false"
              />
              <span v-else class="thumb-icon">{{ getFileIcon(item) }}</span>
            </div>
          </td>

          <!-- Name + date stacked -->
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
              <span v-if="editingPath !== item.path" class="file-meta">
                {{ item.modifiedTime ?? '' }}{{ item.extension ? ' · ' + item.extension.toUpperCase() : '' }}
              </span>
            </div>
          </td>

          <!-- Tags -->
          <td class="col-tags">
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
          <td class="col-size">{{ item.fileSize ? formatSize(item.fileSize) : '—' }}</td>
        </tr>
        <tr v-if="bottomSpacerHeight > 0" class="spacer-row" :style="{ height: bottomSpacerHeight + 'px' }">
          <td colspan="4"></td>
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
        <button class="ctx-item" @click="emit('dblclick', contextMenu.item!); hideContextMenu()">📂 進入資料夾</button>
        <button class="ctx-item" @click="emit('detail', contextMenu.item!); hideContextMenu()">✏️ 修改類別</button>
        <button class="ctx-item" @click="applyRulesForFolder(contextMenu.item!)">🔄 重新套用規則</button>
        <button class="ctx-item" @click="startRename">修改檔名</button>
        <div class="ctx-divider"></div>
        <button class="ctx-item ctx-danger" @click="emit('delete', contextMenu.item!); hideContextMenu()">移至資源回收筒</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="emit('detail', contextMenu.item!); hideContextMenu()">詳情/編輯標籤</button>
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
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  outline: none;
}

.vscroll-outer::-webkit-scrollbar { width: 4px; }
.vscroll-outer::-webkit-scrollbar-thumb {
  background: var(--bg-overlay-strong);
  border-radius: 10px;
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
  background: var(--bg-panel);
  z-index: 10;
  padding: 8px 12px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
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
.comic-table tr.selected td:first-child { box-shadow: inset 2px 0 0 var(--accent); }
.spacer-row td { padding: 0; border: none; }

/* Column widths — all % so table-layout:fixed doesn't collapse auto column */
.col-thumb { width: 7%; min-width: 56px; padding: 8px; }
.col-name  { width: 53%; }
.col-tags  { width: 28%; }
.col-size  { width: 12%; min-width: 72px; text-align: right; font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }

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
  background: rgba(240, 178, 41, 0.1);
  border: 1px solid rgba(240, 178, 41, 0.22);
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
