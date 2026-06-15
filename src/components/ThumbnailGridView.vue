<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { type Item, type FileItem } from '../api';
import { useItemTypes } from '../composables/useItemTypes';
import { useToast } from '../composables/useToast';
import { useContextMenu } from '../composables/useContextMenu';
import { useThumbnailLoader } from '../composables/useThumbnailLoader';
import { useFolderRuleActions } from '../composables/useFolderRuleActions';
import { isReadableFileItem } from '../utils/readableItem';
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
  (e: 'read', item: FileItem): void;
  (e: 'detail', item: FileItem): void;
  (e: 'rename', item: FileItem, newName: string): void;
  (e: 'delete', item: FileItem): void;
  (e: 'addCategory', item: FileItem): void;
  (e: 'rulesApplied'): void;
}>();

const { itemTypes } = useItemTypes();
const { show: showToast } = useToast();
const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu<FileItem>();
const {
  getDbItem,
  hasCategoryAssigned,
  getIcon,
  getItemType,
  getTypeColor,
  loadThumbUrl,
  loadThumbFallbackUrl,
  logThumbDebug,
  onImgError,
} = useThumbnailLoader();

// IPC-based thumbnail loading (same approach as FileExplorerTable)
const thumbUrls = reactive(new Map<string, string>());
const thumbLoading = new Set<string>();
const queuedThumbs = new Set<string>();
const thumbQueue: FileItem[] = [];
let activeThumbLoads = 0;
const MAX_THUMB_LOADS = 6;

const outerRef = ref<HTMLElement | null>(null);
const cardElements = new Map<string, { el: Element; item: FileItem }>();
const observedCards = new Map<Element, string>();
let currentItemPaths = new Set<string>();
let thumbObserver: IntersectionObserver | null = null;

const loadThumb = async (item: FileItem) => {
  const path = item.path;
  if (thumbUrls.has(path) || thumbLoading.has(path) || item.isDir) return;
  thumbLoading.add(path);
  try {
    const url = await loadThumbUrl(item, props.itemByPath);
    if (url && currentItemPaths.has(path)) thumbUrls.set(path, url);
  } finally {
    thumbLoading.delete(path);
  }
};

const handleImgError = async (item: FileItem) => {
  onImgError(item.path);
  const failedUrl = thumbUrls.get(item.path);
  logThumbDebug('img.error.grid', {
    path: item.path,
    name: item.name,
    url: failedUrl,
  });
  if (failedUrl?.startsWith('data:')) return;
  const fallbackUrl = await loadThumbFallbackUrl(item, props.itemByPath);
  if (fallbackUrl && currentItemPaths.has(item.path)) {
    thumbUrls.set(item.path, fallbackUrl);
    logThumbDebug('img.fallback.grid', {
      path: item.path,
      name: item.name,
      fallbackKind: fallbackUrl.startsWith('data:') ? 'base64' : 'url',
    });
  }
};

const pumpThumbQueue = () => {
  while (activeThumbLoads < MAX_THUMB_LOADS && thumbQueue.length > 0) {
    const item = thumbQueue.shift();
    if (!item) continue;
    queuedThumbs.delete(item.path);

    if (thumbUrls.has(item.path) || thumbLoading.has(item.path) || item.isDir) {
      continue;
    }

    activeThumbLoads++;
    loadThumb(item).finally(() => {
      activeThumbLoads--;
      pumpThumbQueue();
    });
  }
};

const enqueueThumb = (item: FileItem) => {
  if (item.isDir || thumbUrls.has(item.path) || thumbLoading.has(item.path) || queuedThumbs.has(item.path)) return;
  queuedThumbs.add(item.path);
  thumbQueue.push(item);
  pumpThumbQueue();
};

const observeCard = (el: Element, item: FileItem) => {
  if (item.isDir || thumbUrls.has(item.path)) return;
  observedCards.set(el, item.path);
  thumbObserver?.observe(el);
};

const registerCard = (el: Element | null, item: FileItem) => {
  const existing = cardElements.get(item.path);
  if (existing) {
    thumbObserver?.unobserve(existing.el);
    observedCards.delete(existing.el);
    cardElements.delete(item.path);
  }

  if (!el || item.isDir) return;
  cardElements.set(item.path, { el, item });
  observeCard(el, item);
};

const resetObserver = () => {
  thumbObserver?.disconnect();
  thumbObserver = null;
  observedCards.clear();

  if (!outerRef.value) return;
  thumbObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const path = observedCards.get(entry.target);
        const item = path ? cardElements.get(path)?.item : null;
        if (!item) return;
        enqueueThumb(item);
        thumbObserver?.unobserve(entry.target);
        observedCards.delete(entry.target);
      });
    },
    {
      root: outerRef.value,
      rootMargin: '800px 0px',
      threshold: 0.01,
    }
  );

  cardElements.forEach(({ el, item }) => observeCard(el, item));
};

watch(() => props.items, items => {
  const livePaths = new Set(items.map(item => item.path));
  currentItemPaths = livePaths;
  Array.from(thumbUrls.keys()).forEach(path => {
    if (!livePaths.has(path)) thumbUrls.delete(path);
  });
  Array.from(cardElements.keys()).forEach(path => {
    if (!livePaths.has(path)) cardElements.delete(path);
  });
  Object.keys(cardRefs.value).forEach(path => {
    if (!livePaths.has(path)) delete cardRefs.value[path];
  });

  thumbQueue.splice(0, thumbQueue.length);
  queuedThumbs.clear();
  nextTick(resetObserver);
}, { immediate: true });

onMounted(() => nextTick(resetObserver));
onUnmounted(() => {
  thumbObserver?.disconnect();
  cardElements.clear();
  observedCards.clear();
  thumbQueue.splice(0, thumbQueue.length);
  queuedThumbs.clear();
});

const cardRefs = ref<Record<string, any>>({});

const { applyRulesForItem } = useFolderRuleActions(
  () => props.itemByPath,
  () => itemTypes.value,
  showToast,
  hideContextMenu,
  () => emit('rulesApplied')
);

const selectedSet = computed(() => new Set(props.selectedPaths ?? []));
const isSelected = (item: FileItem) => selectedSet.value.has(item.path) || item.path === props.selectedItemPath;
const canRead = (item: FileItem) => isReadableFileItem(item, getDbItem(item, props.itemByPath));

const startRenameCtx = () => {
  const item = contextMenu.value.item;
  if (!item) return;
  cardRefs.value[item.path]?.startRename();
  hideContextMenu();
};
</script>

<template>
  <div class="thumb-grid-outer" ref="outerRef" @contextmenu.prevent>
    <div class="thumb-grid">
      <div
        v-for="item in items"
        :key="item.path"
        :ref="el => registerCard(el as Element | null, item)"
        class="thumb-grid-cell"
        @contextmenu.prevent="showContextMenu($event, item)"
      >
        <ThumbnailCard
          :ref="el => { if (el) cardRefs[item.path] = el }"
          :item="item"
          :dbItem="getDbItem(item, itemByPath)"
          :isSelected="isSelected(item)"
          :coverUrl="thumbUrls.get(item.path) ?? null"
          :showCover="!!thumbUrls.get(item.path)"
          :icon="getIcon(item, itemByPath)"
          :typeLabel="getItemType(item, itemByPath)"
          :typeColor="getTypeColor(item, itemByPath)"
          :searchQuery="searchQuery"
          :showReadAction="canRead(item)"
          @click="emit('click', item, $event)"
          @dblclick="emit('dblclick', item)"
          @read="emit('read', item)"
          @contextmenu="showContextMenu($event, item)"
          @rename="emit('rename', item, $event)"
          @imgError="handleImgError(item)"
        />
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop @contextmenu.prevent.stop
    >
      <template v-if="contextMenu.item?.isDir">
        <button class="ctx-item" @click="emit('dblclick', contextMenu.item!); hideContextMenu()">進入資料夾</button>
        <button v-if="contextMenu.item && canRead(contextMenu.item)" class="ctx-item" @click="emit('read', contextMenu.item!); hideContextMenu()">開啟閱讀模式</button>
        <button class="ctx-item" @click="emit('detail', contextMenu.item!); hideContextMenu()">編輯標籤</button>
        <button class="ctx-item" @click="applyRulesForItem(contextMenu.item!)">套用標籤規則</button>
        <button class="ctx-item" @click="startRenameCtx">修改檔名</button>
        <div class="ctx-divider"></div>
        <button class="ctx-item ctx-danger" @click="emit('delete', contextMenu.item!); hideContextMenu()">移至資源回收筒</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="emit('detail', contextMenu.item!); hideContextMenu()">詳情/編輯標籤</button>
        <button class="ctx-item" @click="emit('addCategory', contextMenu.item!); hideContextMenu()">{{ hasCategoryAssigned(contextMenu.item!, itemByPath) ? '修改類別' : '新增類別' }}</button>
        <button class="ctx-item" @click="applyRulesForItem(contextMenu.item!)">套用標籤規則</button>
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
