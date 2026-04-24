<script setup lang="ts">
import { type Comic, type Folder } from '../api';
import { formatSize, formatDate } from '../utils/format';
import { useItemTypes } from '../composables/useItemTypes';

const { getTypeConfig } = useItemTypes();

const props = defineProps<{
  comics: Comic[];
  folders: Folder[];
  selectedComicId: number | null;
  selectedFolderId: number | null;
  editingComicId: number | null;
  editTitle: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}>();

const emit = defineEmits<{
  (e: 'selectComic', comic: Comic): void;
  (e: 'dblclickComic', comic: Comic): void;
  (e: 'contextmenu', comic: Comic, event: MouseEvent): void;
  (e: 'sort', column: string): void;
  (e: 'folderClick', folder: Folder): void;
  (e: 'folderDblclick', folder: Folder): void;
  (e: 'update:editTitle', value: string): void;
  (e: 'submitRename', comic: Comic): void;
  (e: 'cancelRename'): void;
}>();

const sortIcon = (col: string): string => {
  if (props.sortBy !== col) return '↕';
  return props.sortDir === 'asc' ? '↑' : '↓';
};
</script>

<template>
  <table class="comic-table">
    <thead>
      <tr>
        <th class="col-name sortable" @click="emit('sort', 'title')">名稱 {{ sortIcon('title') }}</th>
        <th class="col-size sortable" @click="emit('sort', 'file_size')">大小 {{ sortIcon('file_size') }}</th>
        <th class="col-date sortable" @click="emit('sort', 'file_modified_time')">修改日期 {{ sortIcon('file_modified_time') }}</th>
        <th class="col-type">類型</th>
        <th class="col-tags">標籤</th>
      </tr>
    </thead>

    <!-- Comics -->
    <tbody>
      <tr
        v-for="comic in comics"
        :key="comic.id"
        :class="{ selected: selectedComicId === comic.id, 'is-editing-row': editingComicId === comic.id }"
        @click="emit('selectComic', comic)"
        @dblclick="emit('dblclickComic', comic)"
        @contextmenu.prevent="emit('contextmenu', comic, $event)"
      >
        <td class="col-name">
          <div class="file-info">
            <div v-if="editingComicId === comic.id" class="inline-edit-wrapper">
              <input
                :value="editTitle"
                class="inline-edit-input"
                @input="emit('update:editTitle', ($event.target as HTMLInputElement).value)"
                @click.stop
                @keydown.enter="emit('submitRename', comic)"
                @keydown.esc="emit('cancelRename')"
                @blur="emit('submitRename', comic)"
              />
            </div>
            <span v-else class="file-title" :title="comic.title">{{ comic.title }}</span>
          </div>
        </td>
        <td class="col-size">{{ formatSize(comic.fileSize) }}</td>
        <td class="col-date">{{ formatDate(comic.fileModifiedTime || comic.importTime) }}</td>
        <td class="col-type">—</td>
        <td class="col-tags">
          <div class="tag-chips">
            <span v-for="tag in comic.tags.slice(0, 3)" :key="tag.id" class="mini-tag">{{ tag.name }}</span>
            <span v-if="comic.tags.length > 3" class="tag-more">+{{ comic.tags.length - 3 }}</span>
          </div>
        </td>
      </tr>
    </tbody>

    <!-- Folders -->
    <tbody v-if="folders.length > 0">
      <tr
        v-for="folder in folders"
        :key="'f-' + folder.id"
        :class="{ selected: selectedFolderId === folder.id }"
        @click="emit('folderClick', folder)"
        @dblclick="emit('folderDblclick', folder)"
      >
        <td class="col-name">
          <div class="file-info">
            <span class="file-icon">{{ getTypeConfig(folder.folderType).icon }}</span>
            <span class="file-title" :title="folder.path">{{ folder.name }}</span>
          </div>
        </td>
        <td class="col-size">—</td>
        <td class="col-date">{{ folder.note || '—' }}</td>
        <td class="col-type">{{ getTypeConfig(folder.folderType).displayName }}</td>
        <td class="col-tags">
          <div class="tag-chips">
            <span v-for="tag in folder.tags.slice(0, 3)" :key="tag.id" class="mini-tag">{{ tag.name }}</span>
            <span v-if="folder.tags.length > 3" class="tag-more">+{{ folder.tags.length - 3 }}</span>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
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

.inline-edit-wrapper { flex: 1; }
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

.tag-chips { display: flex; gap: 6px; align-items: center; }
.mini-tag {
  background: rgba(255,255,255,0.08);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.tag-more { font-size: 0.75rem; color: var(--accent-color); }
</style>
