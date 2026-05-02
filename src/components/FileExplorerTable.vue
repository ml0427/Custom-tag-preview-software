<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
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
}>();

const emit = defineEmits<{
  (e: 'click', item: FileItem, event: MouseEvent): void;
  (e: 'dblclick', item: FileItem): void;
  (e: 'detail', item: FileItem): void;
  (e: 'rename', item: FileItem, newName: string): void;
  (e: 'delete', item: FileItem): void;
}>();

// Virtual scroll constants
const ROW_HEIGHT = 44;
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

// Scroll selected into view when changed externally
watch(() => props.selectedItemPath, () => {
  const idx = currentIndex.value;
  if (idx < 0) return;
  nextTick(() => scrollToIndex(idx));
});

// Virtual scroll window
const visibleStart = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - BUFFER));
const visibleEnd = computed(() => Math.min(
  sortedItems.value.length,
  Math.ceil((scrollTop.value + containerHeight.value) / ROW_HEIGHT) + BUFFER
));
const visibleItems = computed(() => sortedItems.value.slice(visibleStart.value, visibleEnd.value));
const topSpacerHeight = computed(() => visibleStart.value * ROW_HEIGHT);
const bottomSpacerHeight = computed(() => (sortedItems.value.length - visibleEnd.value) * ROW_HEIGHT);

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

const getItemType = (item: FileItem): string => {
  if (item.isDir) {
    const dbItem = props.itemByPath.get(item.path);
    if (dbItem) return getTypeConfig(dbItem.category).displayName;
    return '目錄';
  }
  return item.extension?.toUpperCase() ?? '—';
};

const getTypeColor = (item: FileItem): string | null => {
  if (!item.isDir) return null;
  const dbItem = props.itemByPath.get(item.path);
  return getTypeConfig(dbItem?.category).color ?? null;
};

const getItemTags = (item: FileItem) => {
  return props.itemByPath.get(item.path)?.tags ?? [];
};

const selectedSet = computed(() => new Set(props.selectedPaths ?? []));
const isSelected = (item: FileItem): boolean => selectedSet.value.has(item.path) || item.path === props.selectedItemPath;

// Search highlight
const highlightText = (text: string): string => {
  const q = props.searchQuery?.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
};

// Sort — persisted via localStorage
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

watch([sortBy, sortDir], ([by, dir]) => {
  localStorage.setItem('gallery-sort-by', by);
  localStorage.setItem('gallery-sort-dir', dir);
});

const toggleSort = (col: 'name' | 'size' | 'date') => {
  if (sortBy.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = col;
    sortDir.value = col === 'name' ? 'asc' : 'desc';
  }
};

const sortIcon = (col: string) => {
  if (sortBy.value !== col) return '↕';
  return sortDir.value === 'asc' ? '↑' : '↓';
};

const sortedItems = computed(() => {
  return [...props.items].sort((a, b) => {
    let cmp = 0;
    if (sortBy.value === 'name') {
      cmp = a.name.localeCompare(b.name, 'zh-TW', { sensitivity: 'base' });
    } else if (sortBy.value === 'size') {
      cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0);
    } else if (sortBy.value === 'date') {
      cmp = (a.modifiedTime ?? '').localeCompare(b.modifiedTime ?? '');
    }
    return sortDir.value === 'asc' ? cmp : -cmp;
  });
});
</script>

<template>
  <div class="vscroll-outer" ref="outerRef" tabindex="0">
    <table class="comic-table">
      <thead>
        <tr>
          <th class="col-name sortable" @click="toggleSort('name')">名稱 {{ sortIcon('name') }}</th>
          <th class="col-size sortable" @click="toggleSort('size')">大小 {{ sortIcon('size') }}</th>
          <th class="col-date sortable" @click="toggleSort('date')">修改日期 {{ sortIcon('date') }}</th>
          <th class="col-type">類型</th>
          <th class="col-tags">標籤</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="topSpacerHeight > 0" class="spacer-row" :style="{ height: topSpacerHeight + 'px' }">
          <td colspan="5"></td>
        </tr>
        <tr
          v-for="item in visibleItems"
          :key="item.path"
          :class="{ selected: isSelected(item) }"
          @click="emit('click', item, $event)"
          @dblclick="emit('dblclick', item)"
          @contextmenu.prevent="showContextMenu($event, item)"
        >
          <td class="col-name">
            <div class="file-info">
              <span class="file-icon">{{ getFileIcon(item) }}</span>
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
            </div>
          </td>
          <td class="col-size">{{ item.fileSize ? formatSize(item.fileSize) : '—' }}</td>
          <td class="col-date">{{ item.modifiedTime ?? '—' }}</td>
          <td class="col-type">
            <span v-if="getTypeColor(item)" class="type-color-dot" :style="{ background: getTypeColor(item)! }"></span>
            {{ getItemType(item) }}
          </td>
          <td class="col-tags">
            <div class="tag-chips">
              <span
                v-for="tag in getItemTags(item).slice(0, 3)"
                :key="tag.id"
                class="mini-tag"
              >{{ tag.name }}</span>
              <span v-if="getItemTags(item).length > 3" class="tag-more">
                +{{ getItemTags(item).length - 3 }}
              </span>
            </div>
          </td>
        </tr>
        <tr v-if="bottomSpacerHeight > 0" class="spacer-row" :style="{ height: bottomSpacerHeight + 'px' }">
          <td colspan="5"></td>
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

.vscroll-outer::-webkit-scrollbar { width: 10px; }
.vscroll-outer::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
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
  background: rgba(30,30,35,0.97);
  z-index: 10;
  padding: 12px 16px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--panel-border);
  white-space: nowrap;
}
.comic-table th.sortable { cursor: pointer; user-select: none; }
.comic-table th.sortable:hover { color: var(--text-primary); background: rgba(255,255,255,0.05); }

.comic-table td {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.comic-table tr { cursor: default; transition: background 0.2s; }
.comic-table tr:hover { background: rgba(255,255,255,0.03); }
.comic-table tr.selected { background: var(--accent-color-transparent) !important; }
.spacer-row td { padding: 0; border: none; }

.col-name  { width: 38%; }
.col-size  { width: 10%; }
.col-date  { width: 15%; }
.col-type  { width: 12%; }
.col-tags  { width: 25%; }

.file-info { display: flex; align-items: center; gap: 10px; }
.file-icon { font-size: 1rem; flex-shrink: 0; }
.file-title { font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; }

.tag-chips { display: flex; gap: 5px; align-items: center; flex-wrap: nowrap; }
.mini-tag {
  background: rgba(47, 129, 247, 0.12);
  border: 1px solid rgba(47, 129, 247, 0.25);
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--accent-hover);
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag-more { font-size: 0.75rem; color: var(--text-tertiary); flex-shrink: 0; }

.rename-input {
  background: rgba(255,255,255,0.08);
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.95rem;
  padding: 2px 6px;
  outline: none;
  width: 100%;
}

.context-menu {
  position: fixed;
  z-index: 9999;
  background: #1e2130;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 4px;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
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
.ctx-item:hover { background: rgba(255,255,255,0.08); }
.ctx-divider { height: 1px; background: var(--panel-border); margin: 3px 4px; }
.ctx-danger { color: #f87171; }
.ctx-danger:hover { background: rgba(248,65,65,0.12); color: #f87171; }

.type-color-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 5px;
  vertical-align: middle;
  flex-shrink: 0;
}

:deep(mark) {
  background: rgba(255, 200, 0, 0.3);
  color: var(--text-primary);
  border-radius: 2px;
  padding: 0 1px;
}
</style>
