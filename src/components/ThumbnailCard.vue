<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { type Item, type FileItem } from '../api';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  item: FileItem;
  dbItem?: Item;
  isSelected: boolean;
  coverUrl: string | null;
  showCover: boolean;
  icon: string;
  typeLabel: string;
  typeColor: string | null;
  searchQuery?: string;
  pageCount?: number | null;
  showOpenCount?: boolean;
  openCount?: number;
}>();

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
  (e: 'dblclick'): void;
  (e: 'showDetails'): void;
  (e: 'contextmenu', event: MouseEvent): void;
  (e: 'rename', newName: string): void;
  (e: 'imgError'): void;
}>();

const editing = ref(false);
const editName = ref(props.item.name);

const startRename = () => {
  editing.value = true;
  editName.value = props.item.name;
  nextTick(() => {
    document.querySelector<HTMLInputElement>(`.rename-input-${props.item.path.replace(/[^a-zA-Z0-9]/g, '')}`)?.focus();
  });
};

defineExpose({ startRename });

const commitRename = () => {
  const n = editName.value.trim();
  if (n && n !== props.item.name) emit('rename', n);
  editing.value = false;
};

const highlightText = (text: string): string => {
  const q = props.searchQuery?.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
};

const tags = props.dbItem?.tags ?? [];
</script>

<template>
  <div
    class="thumb-card archive-card"
    :class="{ selected: isSelected }"
    @click="emit('click', $event)"
    @dblclick="emit('dblclick')"
    @contextmenu.prevent.stop="emit('contextmenu', $event)"
  >
    <div class="thumb-cover">
      <span v-if="isSelected" class="selection-marker" aria-label="已選取">
        <AppIcon name="check" :size="13" :stroke-width="2.4" />
      </span>
      <img
        v-if="showCover && coverUrl"
        :src="coverUrl"
        :alt="item.name"
        class="thumb-img"
        @error="emit('imgError')"
      />
      <div v-else class="thumb-icon-placeholder">
        <span class="thumb-icon">{{ icon }}</span>
      </div>
      <button
        class="thumb-details-action"
        type="button"
        title="查看詳情"
        :aria-label="`查看 ${item.name} 的詳情`"
        @click.stop="emit('showDetails')"
        @dblclick.stop
      >
        <AppIcon name="panel-right" :size="14" />
        <span>詳情</span>
      </button>
      <div v-if="typeColor" class="thumb-color-bar" :style="{ background: typeColor }"></div>
    </div>

    <div class="thumb-info">
      <div v-if="editing" class="thumb-rename-wrap">
        <input
          v-model="editName"
          :class="`grid-rename-input rename-input-${item.path.replace(/[^a-zA-Z0-9]/g, '')}`"
          @keyup.enter="commitRename"
          @keyup.escape="editing = false"
          @blur="editing = false"
          @click.stop
        />
      </div>
      <div v-else class="thumb-name" :title="item.name" v-html="highlightText(item.name)"></div>

      <div class="thumb-meta">
        <span class="thumb-type">{{ typeLabel }}</span>
        <span v-if="pageCount && pageCount > 0" class="thumb-badge">{{ pageCount }} 頁</span>
        <span v-if="showOpenCount && openCount && openCount > 0" class="thumb-badge thumb-open-count">使用 {{ openCount }} 次</span>
        <div class="thumb-tags" v-if="tags.length > 0">
          <span v-for="tag in tags.slice(0, 2)" :key="tag.id" class="mini-tag">{{ tag.name }}</span>
          <span v-if="tags.length > 2" class="tag-more">+{{ tags.length - 2 }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thumb-card {
  position: relative;
  background: transparent;
  border: 0;
  border-radius: 0;
  overflow: visible;
  cursor: default;
  transition: opacity var(--transition-base);
  display: flex;
  flex-direction: column;
}

.thumb-card:hover {
  background: transparent;
}

.thumb-card.selected {
  background: transparent !important;
  box-shadow: none;
}

.thumb-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  background: var(--bg-image-placeholder);
  overflow: hidden;
  border: 1px solid var(--line-default);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  box-sizing: border-box;
  flex-shrink: 0;
  transition: border-color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-base);
}

.thumb-card:hover .thumb-cover {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.thumb-card.selected .thumb-cover {
  border-color: var(--accent);
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  box-shadow: var(--shadow-md);
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 240ms ease, filter 240ms ease;
}

.thumb-card:hover .thumb-img {
  transform: scale(1.025);
  filter: saturate(1.05) contrast(1.02);
}

.thumb-icon-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
}

.thumb-icon { font-size: 3rem; }

.selection-marker {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: var(--text-on-accent);
  background: var(--accent);
  border: 2px solid var(--bg-image-placeholder);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-sm);
  z-index: 4;
}

.thumb-color-bar {
  position: absolute;
  left: 0;
  top: 0;
  width: 4px;
  height: 100%;
}

.thumb-details-action {
  position: absolute;
  bottom: 9px;
  left: 8px;
  right: 8px;
  height: 30px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--surface-panel);
  color: var(--content-primary);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.16s, transform 0.16s, background 0.16s;
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.thumb-details-action:focus-visible {
  opacity: 1;
  transform: translateY(0);
}

.thumb-details-action:hover {
  background: var(--surface-hover);
}

.thumb-card:hover .thumb-details-action {
  opacity: 1;
  transform: translateY(0);
}

.thumb-info {
  height: var(--thumb-info-height, 74px);
  min-height: var(--thumb-info-height, 74px);
  padding: 9px 2px 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: none;
}

.thumb-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  display: block;
  line-height: 1.35;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.thumb-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.thumb-type {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-secondary);
  background: var(--bg-overlay-soft);
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.thumb-badge {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-secondary);
  background: var(--bg-overlay-soft);
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.thumb-open-count {
  color: var(--accent);
  background: var(--accent-bg-subtle);
}

.thumb-tags { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; overflow: hidden; }

.mini-tag {
  font-family: var(--font-jp);
  font-size: 10px;
  padding: 1px 5px 2px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
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

:deep(mark) {
  background: var(--color-warning-bg-subtle);
  color: var(--text-primary);
  border-radius: 2px;
  padding: 0 1px;
}
</style>
