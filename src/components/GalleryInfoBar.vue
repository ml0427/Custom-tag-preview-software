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
  <div class="info-bar">
    <span class="info-text">
      顯示 {{ count }}
      <template v-if="searchQuery.trim()"> / {{ totalCount }}</template>
      項
    </span>
    <span class="info-dot">·</span>
    <span class="info-text">篩選：{{ filterLabel }}</span>
    <span class="info-dot">·</span>
    <span class="info-text">總大小：{{ sizeLabel }}</span>
  </div>
</template>

<style scoped>
.info-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px 6px;
}
.info-text {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}
.info-dot {
  font-size: 11px;
  color: var(--border-default);
}
</style>
