<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, type Item } from '../api';
import { useItemTypes } from '../composables/useItemTypes';
import { useToast } from '../composables/useToast';
import DetailFormLayout from './DetailFormLayout.vue';

const props = defineProps<{
  item: Item | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
}>();

const { show: showToast } = useToast();
const { itemTypes, getTypeConfig } = useItemTypes();

const editType = ref('default');
const isSaving = ref(false);

watch(() => props.item, (item) => {
  if (item) editType.value = item.category ?? 'default';
}, { immediate: true });

const saveCategory = async () => {
  if (!props.item || isSaving.value) return;
  isSaving.value = true;
  try {
    await api.setItemCategory(props.item.id, editType.value);
    // 改完類別後自動套用該類別的 tag rules，使用者不必再手動按「重新套用類別」
    const type = itemTypes.value.find(t => t.name === editType.value);
    if (type?.tagRules?.length) {
      await api.applyRulesToItem(props.item.id, type.tagRules);
    }
    emit('updated');
    emit('close');
  } catch (e) {
    showToast('儲存失敗: ' + String(e), 'error');
  } finally {
    isSaving.value = false;
  }
};

const openItem = async () => {
  if (!props.item) return;
  await api.openFile(props.item.path);
};
</script>

<template>
  <DetailFormLayout
    v-if="item"
    :title="item.name"
    :subtitle="item.path"
    @close="emit('close')"
  >
    <template #left>
      <div class="category-icon-area">
        <span class="big-icon">{{ getTypeConfig(editType).icon }}</span>
      </div>

      <div class="info-block">
        <label>類別</label>
        <select v-model="editType" class="edit-input" :disabled="isSaving">
          <option v-for="t in itemTypes" :key="t.name" :value="t.name">
            {{ t.icon }} {{ t.displayName }}
          </option>
        </select>
      </div>

      <button class="btn-save" :disabled="isSaving" @click="saveCategory">
        {{ isSaving ? '儲存中...' : '儲存類別' }}
      </button>
    </template>

    <template #right>
      <div class="actions">
        <h3>操作</h3>
        <button class="btn-open" @click="openItem">用系統開啟</button>
      </div>
    </template>
  </DetailFormLayout>
</template>

<style scoped>
.category-icon-area {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 0 10px;
}

.big-icon {
  font-size: 4rem;
  line-height: 1;
}

.info-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.info-block label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.edit-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}

.edit-input:focus {
  border-color: var(--accent);
}

.btn-save,
.btn-open {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s;
  text-align: left;
}

.btn-save {
  background: var(--accent);
  color: var(--text-on-accent);
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.actions h3 {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-default);
}

.btn-open {
  background: var(--bg-overlay-soft);
  color: var(--text-primary);
}
</style>
