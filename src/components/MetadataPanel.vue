<script setup lang="ts">
import { type Tag } from '../api';

const props = defineProps<{
  title: string;
  size?: string;
  date?: string;
  tags: Tag[];
  note?: string | null;
}>();

import { watch } from 'vue';
watch(() => props.tags, (newTags) => {
  console.log(`🏷️ [MetadataPanel] Tags Updated for "${props.title}":`, newTags);
}, { immediate: true });

const emit = defineEmits<{
  (e: 'tagClick', tag: Tag): void;
}>();

const tagStyle = (color?: string | null) => {
  if (!color) return {};
  return { background: `${color}22`, color, borderColor: `${color}66` };
};
</script>

<template>
  <div class="info-scroll">
    <h3 class="item-title">{{ title }}</h3>

    <div v-if="size || date" class="meta-row">
      <span v-if="size" class="meta-val">{{ size }}</span>
      <span v-if="size && date" class="meta-sep">·</span>
      <span v-if="date" class="meta-val">{{ date }}</span>
    </div>

    <div class="section">
      <div class="section-label">標籤</div>
      <div class="tags-container">
        <span
          v-for="tag in tags" :key="tag.id"
          class="tag clickable-tag"
          :style="tagStyle(tag.color)"
          @click="emit('tagClick', tag)"
        >{{ tag.name }}</span>
        <span v-if="tags.length === 0" class="no-tags">尚未添加標籤</span>
      </div>
    </div>

    <div class="section" v-if="note">
      <div class="section-label">備注</div>
      <div class="notes-box">{{ note }}</div>
    </div>
  </div>
</template>

<style scoped>
.info-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 8px;
}
.info-scroll::-webkit-scrollbar { width: 4px; }
.info-scroll::-webkit-scrollbar-thumb { background: var(--bg-overlay-strong); border-radius: 10px; }

.item-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
  word-break: break-word;
  margin-bottom: 8px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}
.meta-val {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
}
.meta-sep { font-size: 11px; color: var(--border-default); }

.section { margin-bottom: 16px; }

.section-label {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tag {
  background: var(--accent-bg-subtle);
  color: var(--accent);
  padding: 3px 12px;
  font-size: 0.85rem;
  border-radius: 100px;
  border: 1px solid var(--accent);
  white-space: nowrap;
}
.clickable-tag { cursor: pointer; transition: background 0.15s, border-color 0.15s; }
.clickable-tag:hover { background: var(--accent-bg-strong); border-color: var(--accent-hover); }

.no-tags { font-style: italic; color: var(--text-tertiary); font-size: 0.85rem; }

.notes-box {
  background: var(--bg-overlay-soft);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
