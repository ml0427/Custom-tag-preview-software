<script setup lang="ts">
defineProps<{
  count: number;
  totalCount: number;
  searchQuery: string;
  filterLabel: string;
  sizeLabel: string;
}>();
</script>

<template>
  <div class="info-bar" aria-label="內容摘要">
    <span class="info-pill info-pill--accent">
      顯示 {{ count }}
      <template v-if="searchQuery.trim()"> / {{ totalCount }}</template>
      項
    </span>
    <span class="info-pill">篩選 {{ filterLabel }}</span>
    <span class="info-pill">容量 {{ sizeLabel }}</span>
  </div>
</template>

<style scoped>
.info-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px 2px 0;
  min-width: 0;
}
.info-pill {
  height: 22px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--content-muted);
  background: var(--surface-panel);
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius-pill);
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  overflow-wrap: anywhere;
}

.info-pill--accent {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-bg-subtle);
}
</style>
