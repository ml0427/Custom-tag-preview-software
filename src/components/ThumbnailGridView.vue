<script setup lang="ts">
import { ref, computed } from 'vue';
import { api, type Item, type FileItem } from '../api';
import { useItemTypes } from '../composables/useItemTypes';
import { useToast } from '../composables/useToast';
import { useContextMenu } from '../composables/useContextMenu';
import { useThumbnailLoader } from '../composables/useThumbnailLoader';
import ThumbnailCard from './ThumbnailCard.vue';

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

const { itemTypes } = useItemTypes();
const { show: showToast } = useToast();
const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu<FileItem>();
const {
  onImgError, getCoverUrl, showCover, getIcon, getItemType, getTypeColor
} = useThumbnailLoader();

const cardRefs = ref<Record<string, any>>({});

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

const selectedSet = computed(() => new Set(props.selectedPaths ?? []));
const isSelected = (item: FileItem) => selectedSet.value.has(item.path) || item.path === props.selectedItemPath;

const startRenameCtx = () => {
  const item = contextMenu.value.item;
  if (!item) return;
  cardRefs.value[item.path]?.startRename();
  hideContextMenu();
};
</script>

<template>
  <div class="thumb-grid-outer">
    <div class="thumb-grid">
      <ThumbnailCard
        v-for="item in items"
        :key="item.path"
        :ref="el => { if (el) cardRefs[item.path] = el }"
        :item="item"
        :dbItem="itemByPath.get(item.path)"
        :isSelected="isSelected(item)"
        :coverUrl="getCoverUrl(item, itemByPath)"
        :showCover="showCover(item, itemByPath)"
        :icon="getIcon(item, itemByPath)"
        :typeLabel="getItemType(item, itemByPath)"
        :typeColor="getTypeColor(item, itemByPath)"
        :searchQuery="searchQuery"
        @click="emit('click', item, $event)"
        @dblclick="emit('dblclick', item)"
        @contextmenu="showContextMenu($event, item)"
        @rename="emit('rename', item, $event)"
        @imgError="onImgError(item.path)"
      />
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

.thumb-grid-outer::-webkit-scrollbar { width: 8px; }
.thumb-grid-outer::-webkit-scrollbar-thumb {
  background: var(--bg-overlay-strong);
  border-radius: 10px;
}

.thumb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
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
</style>
