<script setup lang="ts">
import { ref } from 'vue';
import { useItemTypes } from '../composables/useItemTypes';
import CategoryManageModal from './CategoryManageModal.vue';

const emit = defineEmits<{ (e: 'categorySaved'): void }>();

const { load: loadItemTypes } = useItemTypes();

const showCategoryManage = ref(false);

const handleCategoryClose = () => {
  showCategoryManage.value = false;
  loadItemTypes(true);
  emit('categorySaved');
};
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h2>管理</h2>
    </div>
    <div class="panel-body">
      <button class="manage-btn" @click="showCategoryManage = true">
        <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
        管理類別
      </button>
    </div>
  </div>

  <CategoryManageModal :visible="showCategoryManage" @close="handleCategoryClose" />
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.panel-header h2 {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-tertiary);
  font-weight: 500;
}

.panel-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.manage-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 500;
  font-family: var(--font-mono);
  background: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
  text-align: left;
}

.manage-btn:hover:not(:disabled) {
  background: var(--bg-overlay-soft);
  color: var(--text-primary);
}

.manage-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
</style>
