<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { type Item, type FileItem } from '../api';

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
}>();

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
  (e: 'dblclick'): void;
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
    class="thumb-card"
    :class="{ selected: isSelected }"
    @click="emit('click', $event)"
    @dblclick="emit('dblclick')"
    @contextmenu.prevent="emit('contextmenu', $event)"
  >
    <div class="thumb-cover">
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

:deep(mark) {
  background: var(--color-warning);
  color: var(--text-primary);
  border-radius: 2px;
  padding: 0 1px;
}
</style>
