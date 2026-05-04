<script setup lang="ts">
import { computed } from 'vue';
import { type Item, type FileItem } from '../api';
import { useItemTypes } from '../composables/useItemTypes';

const props = defineProps<{
  item: Item | null;
  fileItem?: FileItem | null;
  coverUrl: string;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
}>();

const { getTypeByExtension } = useItemTypes();

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

const placeholderIcon = computed(() => {
  if (props.item?.itemType === 'folder' || props.fileItem?.isDir) return '📁';
  const ext = props.item
    ? (props.item.path.split('.').pop() ?? '')
    : (props.fileItem?.extension ?? '');
  const matched = getTypeByExtension(ext);
  if (matched) return matched.icon;
  if (IMAGE_EXTS.includes(ext.toLowerCase())) return '🖼️';
  return '📄';
});
</script>

<template>
  <div class="cover-wrapper" @click="emit('click')">
    <img v-if="coverUrl" :src="coverUrl" :alt="item?.name || fileItem?.name" class="preview-cover" />
    <div v-else class="cover-placeholder">{{ placeholderIcon }}</div>
    <div v-if="item" class="zoom-overlay"><span>點擊查看詳情</span></div>
  </div>
</template>

<style scoped>
.cover-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 3/4;
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-image-placeholder);
  flex-shrink: 0;
  max-height: 45%;
}

.preview-cover {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform 0.5s ease;
}
.cover-wrapper:hover .preview-cover { transform: scale(1.04); }

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 4rem;
  background: var(--bg-overlay-soft);
}

.zoom-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg-scrim);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
  font-size: 0.85rem;
  color: #fff;
}
.cover-wrapper:hover .zoom-overlay { opacity: 1; }
</style>
