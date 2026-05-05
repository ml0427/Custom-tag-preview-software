<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  sourcePath: string | null;
  searchQuery: string;
  sortBy: string;
  sortDir: string;
  sortLabel: string;
  viewMode: 'list' | 'grid';
  isLoading: boolean;
  hasParent: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void;
  (e: 'update:viewMode', val: 'list' | 'grid'): void;
  (e: 'refresh'): void;
  (e: 'goUp'): void;
  (e: 'updateSortBy', col: string): void;
  (e: 'toggleSortDir'): void;
}>();

const gallerySearch = computed({
  get: () => props.searchQuery,
  set: (val) => emit('update:searchQuery', val)
});
</script>

<template>
  <div class="search-bar-wrap">
    <template v-if="sourcePath">
      <button class="nav-btn" :disabled="!hasParent" @click="emit('goUp')" title="上一層">↑</button>
      <button class="nav-btn" @click="emit('refresh')" :class="{ spinning: isLoading }" title="重新整理">↺</button>
      <span class="divider"></span>
    </template>
    <span class="search-icon">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>
    </span>
    <input
      v-model="gallerySearch"
      class="gallery-search"
      placeholder="搜尋檔名、標籤、備注..."
    />
    <button v-if="gallerySearch" class="clear-btn" @click="gallerySearch = ''" title="清除搜尋">✕</button>
    <div class="header-right">
      <div class="sort-group">
        <select class="sort-select" :value="sortBy" @change="emit('updateSortBy', ($event.target as HTMLSelectElement).value)">
          <option value="name">名稱</option>
          <option value="size">大小</option>
          <option value="date">時間</option>
        </select>
        <button class="sort-dir-btn" @click="emit('toggleSortDir')" title="切換排序方向">
          {{ sortDir === 'asc' ? '↑' : '↓' }}
        </button>
      </div>
      <div class="view-toggle">
        <button class="view-btn" :class="{ active: viewMode === 'list' }" @click="emit('update:viewMode', 'list')" title="列表檢視">☰</button>
        <button class="view-btn" :class="{ active: viewMode === 'grid' }" @click="emit('update:viewMode', 'grid')" title="縮圖格子">⊞</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-bar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  margin-bottom: 6px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

.sort-group {
  display: flex;
  align-items: center;
  background: var(--bg-overlay-soft);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  overflow: hidden;
}

.sort-select {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-family: var(--font-mono);
  padding: 3px 6px 3px 8px;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}
.sort-select:hover { color: var(--text-primary); }

.sort-dir-btn {
  background: transparent;
  border: none;
  border-left: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-family: var(--font-mono);
  padding: 3px 8px;
  cursor: pointer;
  line-height: 1.6;
  transition: color 0.15s, background 0.15s;
}
.sort-dir-btn:hover { color: var(--text-primary); background: var(--bg-overlay-strong); }

.nav-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 1rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
}
.nav-btn:disabled { opacity: 0.3; cursor: default; }
.nav-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-overlay-soft); }
.nav-btn.spinning { animation: spin 0.5s linear; }
@keyframes spin { to { transform: rotate(360deg); } }

.divider {
  width: 1px;
  height: 16px;
  background: var(--border-default);
  flex-shrink: 0;
}

.clear-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  flex-shrink: 0;
  line-height: 1;
}
.clear-btn:hover { color: var(--text-primary); background: var(--bg-overlay-soft); }

.search-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--text-tertiary);
}
.search-icon svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
}

.gallery-search {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11px;
}

.gallery-search::placeholder { color: var(--text-secondary); }

.view-toggle {
  display: flex;
  gap: 1px;
  flex-shrink: 0;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  padding: 2px;
}
.view-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 3px 7px;
  border-radius: var(--radius-sm);
  line-height: 1;
  transition: color var(--transition-fast), background var(--transition-fast);
}
.view-btn:hover { color: var(--text-primary); background: var(--bg-overlay-soft); }
.view-btn.active {
  color: var(--accent);
  background: var(--accent-bg-subtle);
  box-shadow: 0 0 6px var(--accent-border);
}
</style>
