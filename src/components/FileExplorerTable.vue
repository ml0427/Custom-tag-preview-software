<script setup lang="ts">
import { computed } from 'vue';
import { type Comic, type Folder, type FileItem } from '../api';
import { formatSize } from '../utils/format';

const props = defineProps<{
  items: FileItem[];
  comicByPath: Map<string, Comic>;
  folderByPath: Map<string, Folder>;
  selectedComicId: number | null;
}>();

const emit = defineEmits<{
  (e: 'click', item: FileItem): void;
  (e: 'dblclick', item: FileItem): void;
}>();

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

const isSelected = (item: FileItem): boolean => {
  const comic = props.comicByPath.get(item.path);
  return comic ? comic.id === props.selectedComicId : false;
};
</script>

<template>
  <table class="comic-table">
    <thead>
      <tr>
        <th class="col-name">名稱</th>
        <th class="col-size">大小</th>
        <th class="col-date">修改日期</th>
        <th class="col-type">類型</th>
        <th class="col-tags">標籤</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="item in items"
        :key="item.path"
        :class="{ selected: isSelected(item) }"
        @click="emit('click', item)"
        @dblclick="emit('dblclick', item)"
      >
        <td class="col-name">
          <div class="file-info">
            <span class="file-icon">{{ getFileIcon(item) }}</span>
            <span class="file-title" :title="item.path">{{ item.name }}</span>
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
