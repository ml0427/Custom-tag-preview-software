<script setup lang="ts">
import { type ScanPreviewItem } from '../api';

defineProps<{
  previewItems: ScanPreviewItem[];
  isLoading: boolean;
}>();
</script>

<template>
  <div class="preview-container">
    <div v-if="isLoading" class="loading-hint">套用中...</div>
    <div v-else-if="previewItems.length === 0" class="empty-hint">沒有項目符合規則</div>
    <div v-else class="preview-list">
      <div v-for="item in previewItems" :key="item.path" class="preview-row">
        <span class="item-icon">{{ item.isDir ? '📁' : '📄' }}</span>
        <span class="item-name" :title="item.path">{{ item.name }}</span>
        <div class="tag-chips">
          <span v-for="tag in item.proposedTags" :key="tag" class="mini-tag">{{ tag }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-input);
}
.preview-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.preview-row:last-child { border-bottom: none; }
.item-icon { flex-shrink: 0; }
.item-name {
  flex: 1;
  font-size: 0.9rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-chips { display: flex; flex-wrap: wrap; gap: 4px; flex-shrink: 0; }
.mini-tag {
  background: var(--accent-bg-subtle);
  color: var(--accent);
  border: 1px solid var(--accent);
  padding: 2px 8px;
  border-radius: 100px;
  font-size: 0.78rem;
}

.loading-hint, .empty-hint {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px;
  font-size: 0.9rem;
}

.preview-list::-webkit-scrollbar { width: 4px; }
.preview-list::-webkit-scrollbar-thumb { background: var(--bg-overlay-strong); border-radius: 10px; }
</style>
