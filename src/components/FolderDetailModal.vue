<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, type Item, type Tag } from '../api';
import { useTagManager } from '../composables/useTagManager';
import { useToast } from '../composables/useToast';
import { useItemTypes } from '../composables/useItemTypes';
import DetailFormLayout from './DetailFormLayout.vue';
import TagEditorField from './TagEditorField.vue';

const props = defineProps<{
  item: Item | null;
  allTags: Tag[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
  (e: 'deleted'): void;
}>();

const { show: showToast, confirm: confirmDialog } = useToast();
const { itemTypes, getTypeConfig } = useItemTypes();
const editName = ref('');
const editNote = ref('');
const editType = ref('default');
const isSaving = ref(false);

const { localTags, tagInput, suggestions: tagInputSuggestions, showSuggestions: showTagInputSuggestions,
    initTags, onInputChange: onTagInputChange, submitInput: submitTagInput,
    selectSuggestion: selectTagSuggestion, removeTagById: removeTag, hideSuggestions: hideTagSuggestions,
} = useTagManager({
    getEntityId: () => props.item?.id ?? null,
    addTag: (id, tagId) => api.tagItem(id, tagId),
    removeTag: (id, tagId) => api.untagItem(id, tagId),
    onUpdated: () => emit('updated'),
});

watch(() => props.item, (item) => {
  if (item) {
    initTags(item.tags);
    editName.value = item.name;
    editNote.value = item.note ?? '';
    editType.value = item.category ?? 'default';
  }
}, { immediate: true });

const saveChanges = async () => {
  if (!props.item || isSaving.value) return;
  isSaving.value = true;
  try {
    await api.updateFolder(props.item.id, editName.value.trim(), editType.value, editNote.value.trim());
    emit('updated');
  } catch (e) {
    showToast('儲存失敗: ' + String(e), 'error');
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async () => {
  if (!props.item) return;
  if (!await confirmDialog(`確定刪除「${props.item.name}」？`)) return;
  try {
    await api.deleteFolder(props.item.id);
    emit('deleted');
    emit('close');
  } catch (e) {
    showToast('刪除失敗: ' + String(e), 'error');
  }
};

const openFolder = async () => {
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
      <div class="folder-icon-area">
        <span class="big-icon">{{ getTypeConfig(item.category).icon }}</span>
      </div>

      <div class="info-block">
        <label>名稱</label>
        <input v-model="editName" class="edit-input" @blur="saveChanges" @keydown.enter="saveChanges" />
      </div>

      <div class="info-block">
        <label>類別</label>
        <select v-model="editType" class="edit-input" @change="saveChanges">
          <option v-for="t in itemTypes" :key="t.name" :value="t.name">
            {{ t.icon }} {{ t.displayName }}
          </option>
        </select>
      </div>

      <div class="info-block">
        <label>備註</label>
        <textarea v-model="editNote" class="edit-input edit-textarea" rows="3"
          @blur="saveChanges" placeholder="輸入備註..."></textarea>
      </div>

      <TagEditorField
        :tags="localTags"
        v-model:tagInput="tagInput"
        :suggestions="tagInputSuggestions"
        :showSuggestions="showTagInputSuggestions"
        @remove="removeTag"
        @submit="submitTagInput"
        @selectSuggestion="selectTagSuggestion"
        @blur="hideTagSuggestions"
      />
    </template>

    <template #right>
      <div class="actions">
        <h3>操作</h3>
        <button class="btn-open" @click="openFolder">📂 用系統開啟</button>
        <button class="btn-delete" @click="handleDelete">🗑️ 刪除條目</button>
      </div>
    </template>
  </DetailFormLayout>
</template>

<style scoped>
.folder-icon-area {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 0 10px;
}
.big-icon { font-size: 4rem; line-height: 1; }

.info-block { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.info-block label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.edit-input {
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 7px 10px;
  font-size: 0.9rem;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.2s;
  font-family: inherit;
}
.edit-input:focus { border-color: var(--accent); }
.edit-textarea { resize: vertical; }

.actions { display: flex; flex-direction: column; gap: 10px; }
.actions h3 { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border-default); }

.btn-open, .btn-delete {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s;
  text-align: left;
}
.btn-open {
  background: var(--bg-overlay-soft);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
}
.btn-open:hover { background: var(--bg-overlay-strong); }

.btn-delete {
  background: transparent;
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
}
.btn-delete:hover { background: var(--color-danger-bg-subtle); }
</style>
