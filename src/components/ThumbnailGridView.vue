<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { api, type Item, type FileItem } from '../api';
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

const { getTypeConfig, getTypeByExtension, itemTypes } = useItemTypes();
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

const failedImages = ref(new Set<string>());
const onImgError = (path: string) => {
  failedImages.value = new Set(failedImages.value).add(path);
};

const getCoverUrl = (item: FileItem): string | null => {
  if (item.isDir) return null;
  const dbItem = props.itemByPath.get(item.path);
  if (!dbItem) return null;
  return `comic-cache://localhost/${dbItem.id}.jpg`;
};

const showCover = (item: FileItem): boolean => {
  const url = getCoverUrl(item);
  return !!url && !failedImages.value.has(item.path);
};

const getIcon = (item: FileItem): string => {
  if (item.isDir) {
    const ft = props.itemByPath.get(item.path)?.category;
    return getTypeConfig(ft).icon;
  }
  const ext = item.extension?.toLowerCase() ?? '';
  const matched = getTypeByExtension(ext);
  if (matched) return matched.icon;
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return '🖼️';
  if (['mp4','mkv','avi','mov','wmv'].includes(ext)) return '🎬';
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

const getItemTags = (item: FileItem) => props.itemByPath.get(item.path)?.tags ?? [];
const selectedSet = computed(() => new Set(props.selectedPaths ?? []));
const isSelected = (item: FileItem) => selectedSet.value.has(item.path) || item.path === props.selectedItemPath;

// Highlight search
const highlightText = (text: string): string => {
  const q = props.searchQuery?.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
};

// Inline rename
const editingPath = ref<string | null>(null);
const editName = ref('');

const startRenameForItem = (item: FileItem) => {
  editingPath.value = item.path;
  editName.value = item.name;
  nextTick(() => {
    document.querySelector<HTMLInputElement>('.grid-rename-input')?.focus();
  });
};
const commitRename = (item: FileItem) => {
  const n = editName.value.trim();
  if (n && n !== item.name) emit('rename', item, n);
  editingPath.value = null;
};
const cancelRename = () => { editingPath.value = null; };

// Context menu
const contextMenu = ref<{ visible: boolean; x: number; y: number; item: FileItem | null }>({
  visible: false, x: 0, y: 0, item: null,
});
const showContextMenu = (e: MouseEvent, item: FileItem) => {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, item };
};
const hideContextMenu = () => { contextMenu.value.visible = false; };
const startRenameCtx = () => {
  if (!contextMenu.value.item) return;
  startRenameForItem(contextMenu.value.item);
  hideContextMenu();
};

onMounted(() => { document.addEventListener('click', hideContextMenu); });
onUnmounted(() => { document.removeEventListener('click', hideContextMenu); });
</script>

<template>
  <div class="thumb-grid-outer">
    <div class="thumb-grid">
      <div
        v-for="item in items"
        :key="item.path"
        class="thumb-card"
        :class="{ selected: isSelected(item) }"
        @click="emit('click', item, $event)"
        @dblclick="emit('dblclick', item)"
        @contextmenu.prevent="showContextMenu($event, item)"
      >
        <div class="thumb-cover">
          <img
            v-if="showCover(item)"
            :src="getCoverUrl(item)!"
            :alt="item.name"
            class="thumb-img"
            @error="onImgError(item.path)"
          />
          <div v-else class="thumb-icon-placeholder">
            <span class="thumb-icon">{{ getIcon(item) }}</span>
          </div>
          <div v-if="getTypeColor(item)" class="thumb-color-bar" :style="{ background: getTypeColor(item)! }"></div>
        </div>

        <div class="thumb-info">
          <div v-if="editingPath === item.path" class="thumb-rename-wrap">
            <input
              v-model="editName"
              class="grid-rename-input"
              @keyup.enter="commitRename(item)"
              @keyup.escape="cancelRename"
              @blur="cancelRename"
              @click.stop
            />
          </div>
          <div v-else class="thumb-name" :title="item.name" v-html="highlightText(item.name)"></div>

          <div class="thumb-meta">
            <span class="thumb-type">{{ getItemType(item) }}</span>
            <div class="thumb-tags" v-if="getItemTags(item).length > 0">
              <span v-for="tag in getItemTags(item).slice(0, 2)" :key="tag.id" class="mini-tag">{{ tag.name }}</span>
              <span v-if="getItemTags(item).length > 2" class="tag-more">+{{ getItemTags(item).length - 2 }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
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
        <button class="ctx-item" @click="startRenameCtx">修改檔名</button>
        <div class="ctx-divider"></div>
        <button class="ctx-item ctx-danger" @click="emit('delete', contextMenu.item!); hideContextMenu()">移至資源回收筒</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="emit('detail', contextMenu.item!); hideContextMenu()">詳情/編輯標籤</button>
        <button class="ctx-item" @click="startRenameCtx">修改檔名</button>
        <div class="ctx-divider"></div>
        <button class="ctx-item ctx-danger" @click="emit('delete', contextMenu.item!); hideContextMenu()">移至資源回收筒</button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.thumb-grid-outer {
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  box-sizing: border-box;
}

.thumb-grid-outer::-webkit-scrollbar { width: 10px; }
.thumb-grid-outer::-webkit-scrollbar-thumb {
  background: var(--bg-overlay-strong);
  border-radius: 10px;
}

.thumb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.thumb-card {
  background: var(--bg-overlay-soft);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  overflow: hidden;
  cursor: default;
  transition: background 0.2s, border-color 0.2s, transform 0.15s;
  display: flex;
  flex-direction: column;
}

.thumb-card:hover {
  background: var(--bg-overlay-strong);
  border-color: var(--border-default);
  transform: translateY(-2px);
}

.thumb-card.selected {
  background: var(--accent-bg-subtle) !important;
  border-color: var(--accent) !important;
}

.thumb-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  background: var(--bg-image-placeholder);
  overflow: hidden;
  flex-shrink: 0;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-icon-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb-icon { font-size: 3rem; }

.thumb-color-bar {
  position: absolute;
  left: 0;
  top: 0;
  width: 4px;
  height: 100%;
}

.thumb-info {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}

.thumb-name {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.35;
  word-break: break-all;
}

.thumb-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.thumb-type {
  font-size: 0.7rem;
  color: var(--text-secondary);
  background: var(--bg-overlay-soft);
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.thumb-tags { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; overflow: hidden; }

.mini-tag {
  background: var(--accent-bg-subtle);
  border: 1px solid var(--accent);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  font-size: 0.68rem;
  color: var(--accent-hover);
  white-space: nowrap;
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag-more { font-size: 0.68rem; color: var(--text-tertiary); flex-shrink: 0; }

.thumb-rename-wrap { padding: 2px 0; }
.grid-rename-input {
  width: 100%;
  background: var(--bg-overlay-strong);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.82rem;
  padding: 2px 6px;
  outline: none;
  box-sizing: border-box;
}

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
