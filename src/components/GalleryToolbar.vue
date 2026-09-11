<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  sourcePath: string | null;
  searchQuery: string;
  sortBy: string;
  sortDir: string;
  sortLabel: string;
  viewMode: 'list' | 'grid';
  frequentMode: boolean;
  isLoading: boolean;
  hasParent: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void;
  (e: 'update:viewMode', val: 'list' | 'grid'): void;
  (e: 'update:frequentMode', val: boolean): void;
  (e: 'refresh'): void;
  (e: 'goUp'): void;
  (e: 'updateSortBy', col: string): void;
  (e: 'toggleSortDir'): void;
}>();

const gallerySearch = computed({
  get: () => props.searchQuery,
  set: (val) => emit('update:searchQuery', val),
});
</script>

<template>
  <div class="gallery-command-bar" role="search">
    <div v-if="sourcePath" class="navigation-controls">
      <button class="command-icon" :disabled="!hasParent" @click="emit('goUp')" title="上一層" aria-label="上一層">
        <AppIcon name="arrow-up" :size="17" />
      </button>
      <button class="command-icon" @click="emit('refresh')" :class="{ spinning: isLoading }" title="重新整理" aria-label="重新整理">
        <AppIcon name="refresh" :size="17" />
      </button>
      <span class="command-divider" aria-hidden="true"></span>
    </div>

    <label class="command-search">
      <AppIcon name="search" :size="16" />
      <input
        v-model="gallerySearch"
        class="gallery-search"
        placeholder="搜尋檔名、標籤、備註..."
        aria-label="搜尋檔名、標籤或備註"
      />
      <button v-if="gallerySearch" type="button" class="search-clear" @click.prevent="gallerySearch = ''" title="清除搜尋" aria-label="清除搜尋">
        <AppIcon name="x" :size="14" />
      </button>
    </label>

    <div class="command-actions">
      <div v-if="viewMode === 'grid'" class="sort-controls" :title="sortLabel">
        <select class="sort-select" :value="sortBy" aria-label="排序欄位" @change="emit('updateSortBy', ($event.target as HTMLSelectElement).value)">
          <option value="name">名稱</option>
          <option value="size">大小</option>
          <option value="date">時間</option>
        </select>
        <button class="sort-direction" @click="emit('toggleSortDir')" title="切換排序方向" aria-label="切換排序方向">
          {{ sortDir === 'asc' ? '↑' : '↓' }}
        </button>
      </div>

      <div class="view-segment" role="group" aria-label="顯示模式">
        <button
          class="segment-button"
          :class="{ active: viewMode === 'list' }"
          :aria-pressed="viewMode === 'list'"
          @click="emit('update:viewMode', 'list')"
          title="列表檢視"
        >
          <AppIcon name="list" :size="16" />
          <span>列表</span>
        </button>
        <button
          class="segment-button"
          :class="{ active: viewMode === 'grid' }"
          :aria-pressed="viewMode === 'grid'"
          @click="emit('update:viewMode', 'grid')"
          title="縮圖格子"
        >
          <AppIcon name="grid" :size="15" />
          <span>封面</span>
        </button>
      </div>

      <button
        class="command-chip frequent-btn"
        :class="{ active: frequentMode }"
        @click="emit('update:frequentMode', !frequentMode)"
        title="顯示常用項目"
        :aria-pressed="frequentMode"
      >
        <AppIcon name="star" :size="14" />
        <span>常用</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.gallery-command-bar {
  min-width: 0;
  min-height: 42px;
  padding: 0 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
}

.navigation-controls,
.command-actions,
.view-segment,
.sort-controls {
  display: flex;
  align-items: center;
}

.navigation-controls {
  gap: 3px;
}

.command-icon,
.search-clear,
.sort-direction {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--content-muted);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
}

.command-icon {
  width: var(--control-height-md);
  height: var(--control-height-md);
  padding: 0;
  border-radius: var(--radius-md);
}

.command-icon:disabled {
  opacity: 0.28;
  cursor: default;
}

.command-icon.spinning :deep(svg) {
  animation: spin 0.55s linear;
}

@keyframes spin { to { transform: rotate(360deg); } }

.command-divider {
  width: 1px;
  height: 22px;
  margin: 0 2px;
  background: var(--line-default);
}

.command-search {
  min-width: 180px;
  height: 40px;
  padding: 0 9px 0 11px;
  flex: 1 1 320px;
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--content-muted);
  background: var(--surface-input);
  border: 1px solid var(--line-default);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.command-search:focus-within {
  color: var(--accent);
  border-color: var(--accent);
  box-shadow: var(--ring-focus);
}

.gallery-search {
  min-width: 0;
  height: 100%;
  padding: 0;
  flex: 1;
  color: var(--content-primary);
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-jp);
  font-size: 0.78rem;
}

.gallery-search::placeholder {
  color: var(--content-muted);
}

.search-clear {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: var(--radius-sm);
}

.command-actions {
  margin-left: auto;
  gap: 7px;
}

.sort-controls,
.view-segment {
  height: 40px;
  padding: 3px;
  background: var(--surface-raised);
  border: 1px solid var(--line-default);
  border-radius: var(--radius-md);
}

.sort-select {
  height: 34px;
  padding: 0 22px 0 8px;
  color: var(--content-secondary);
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-mono);
  font-size: 10px;
  cursor: pointer;
}

.sort-direction {
  width: 28px;
  height: 34px;
  padding: 0;
  border-left-color: var(--line-default);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

.view-segment {
  gap: 2px;
}

.segment-button,
.command-chip {
  height: 28px;
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--content-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-family: var(--font-jp);
  font-size: 0.68rem;
  white-space: nowrap;
}

.command-chip {
  height: var(--control-height-md);
  padding-inline: 11px;
  background: var(--surface-raised);
  border-color: var(--line-default);
}

.command-icon:hover:not(:disabled),
.search-clear:hover,
.sort-direction:hover,
.segment-button:hover,
.command-chip:hover {
  color: var(--content-primary);
  background: var(--surface-hover);
  border-color: var(--line-default);
}

.segment-button.active,
.command-chip.active {
  color: var(--accent);
  background: var(--accent-bg-subtle);
  border-color: var(--accent-border);
}

@media (max-width: 1080px) {
  .segment-button span,
  .frequent-btn span {
    display: none;
  }

  .segment-button,
  .command-chip {
    width: 30px;
    padding: 0;
  }
}
</style>
