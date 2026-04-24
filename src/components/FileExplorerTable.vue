<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { type Comic, type Folder, type FileItem } from '../api';
import { formatSize } from '../utils/format';

const props = defineProps<{
  items: FileItem[];
  comicByPath: Map<string, Comic>;
  folderByPath: Map<string, Folder>;
  selectedItemPath: string | null;
}>();

const emit = defineEmits<{
  (e: 'click', item: FileItem): void;
  (e: 'dblclick', item: FileItem): void;
  (e: 'detail', item: FileItem): void;
  (e: 'rename', item: FileItem, newName: string): void;
}>();

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

const commitRename = (item: FileItem) => {
  const newName = editName.value.trim();
  if (newName && newName !== item.name) emit('rename', item, newName);
  editingPath.value = null;
};

const cancelRename = () => { editingPath.value = null; };

onMounted(() => document.addEventListener('click', hideContextMenu));
onUnmounted(() => document.removeEventListener('click', hideContextMenu));

const getFileIcon = (item: FileItem): string => {
  if (item.isDir) {
    return props.folderByPath.get(item.path)?.folderType === 'comic' ? '📚' : '📁';
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
    const folder = props.folderByPath.get(item.path);
    if (folder) return folder.folderType === 'comic' ? '漫畫' : '一般';
    return '目錄';
  }
  return item.extension?.toUpperCase() ?? '—';
};

const getItemTags = (item: FileItem) => {
  const comic = props.comicByPath.get(item.path);
  if (comic) return comic.tags;
  return props.folderByPath.get(item.path)?.tags ?? [];
};

const isSelected = (item: FileItem): boolean => item.path === props.selectedItemPath;

// 本地排序狀態
const sortBy = ref<'name' | 'size' | 'date'>('name');
const sortDir = ref<'asc' | 'desc'>('asc');

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
      <tr
        v-for="item in sortedItems"
        :key="item.path"
        :class="{ selected: isSelected(item) }"
        @click="emit('click', item)"
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
            <span v-else class="file-title" :title="item.path">{{ item.name }}</span>
          </div>
        </td>
        <td class="col-size">{{ item.fileSize ? formatSize(item.fileSize) : '—' }}</td>
        <td class="col-date">{{ item.modifiedTime ?? '—' }}</td>
        <td class="col-type">{{ getItemType(item) }}</td>
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
    </tbody>
  </table>

  <Teleport to="body">
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop
    >
      <button class="ctx-item" @click="emit('detail', contextMenu.item!); hideContextMenu()">詳情/編輯標籤</button>
      <button class="ctx-item" @click="startRename">修改檔名</button>
    </div>
  </Teleport>
</template>

<style scoped>
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
  min-width: 150px;
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
</style>
