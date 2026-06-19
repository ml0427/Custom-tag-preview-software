<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, type Item, type Tag, type FolderRulePreset } from '../api';
import { useTagManager } from '../composables/useTagManager';
import { useToast } from '../composables/useToast';
import { useItemTypes } from '../composables/useItemTypes';
import DetailFormLayout from './DetailFormLayout.vue';
import MetadataLookupModal from './MetadataLookupModal.vue';
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
const { itemTypes, load: loadItemTypes } = useItemTypes();
const editName = ref('');
const editNote = ref('');
const isSaving = ref(false);
const isSavingPreset = ref(false);
const isApplyingPreset = ref(false);
const rulePreset = ref<FolderRulePreset | null>(null);
const selectedRulePresetId = ref<number | null>(null);
const showMetadataLookup = ref(false);
const rulePresetOptions = computed(() => itemTypes.value.filter(t => t.tagRules?.length));
const selectedRulePreset = computed(() => (
  selectedRulePresetId.value == null
    ? null
    : itemTypes.value.find(t => t.id === selectedRulePresetId.value) ?? null
));

const { localTags, tagInput, suggestions: tagInputSuggestions, showSuggestions: showTagInputSuggestions,
    initTags, onInputChange: onTagInputChange, submitInput: submitTagInput,
    selectSuggestion: selectTagSuggestion, removeTagById: removeTag, hideSuggestions: hideTagSuggestions,
} = useTagManager({
    getEntityId: () => props.item?.id ?? null,
    addTag: (id, tagId) => api.tagItem(id, tagId),
    removeTag: (id, tagId) => api.untagItem(id, tagId),
    onUpdated: () => emit('updated'),
});

watch(() => props.item, async (item) => {
  if (item) {
    initTags(item.tags);
    editName.value = item.name;
    editNote.value = item.note ?? '';
    await loadItemTypes();
    rulePreset.value = await api.getFolderRulePreset(item.id);
    selectedRulePresetId.value = rulePreset.value?.presetTypeId ?? null;
  }
}, { immediate: true });

const saveRulePreset = async () => {
  if (!props.item || isSavingPreset.value) return;
  isSavingPreset.value = true;
  try {
    if (selectedRulePresetId.value == null) {
      await api.clearFolderRulePreset(props.item.id);
      rulePreset.value = null;
      showToast('已清除預設標籤規則集', 'success');
    } else {
      rulePreset.value = await api.setFolderRulePreset({
        folderItemId: props.item.id,
        presetTypeId: selectedRulePresetId.value,
        applyToSubfolders: false,
        applyToFiles: false,
        fileExtensions: [],
      });
      showToast('已儲存預設標籤規則集', 'success');
    }
    emit('updated');
  } catch (e) {
    showToast('儲存預設規則集失敗: ' + String(e), 'error');
  } finally {
    isSavingPreset.value = false;
  }
};

const applySelectedRulePreset = async () => {
  if (!props.item || isApplyingPreset.value) return;
  const preset = selectedRulePreset.value;
  if (!preset?.tagRules?.length) {
    showToast('此規則集沒有可套用的標籤規則', 'info');
    return;
  }
  isApplyingPreset.value = true;
  try {
    const result = await api.applyRulesToItem(props.item.id, preset.tagRules);
    showToast(`已套用 ${result.tagged} 個標籤`, 'success');
    emit('updated');
  } catch (e) {
    showToast('套用預設規則集失敗: ' + String(e), 'error');
  } finally {
    isApplyingPreset.value = false;
  }
};

const saveChanges = async () => {
  if (!props.item || isSaving.value) return;
  isSaving.value = true;
  try {
    const item = props.item;
    const newName = editName.value.trim();
    const newNote = editNote.value.trim();
    await Promise.all([
      newName !== item.name ? api.setItemDisplayName(item.id, newName) : Promise.resolve(),
      newNote !== (item.note ?? '') ? api.setItemNote(item.id, newNote) : Promise.resolve(),
    ]);
    emit('updated');
  } catch (e) {
    showToast('儲存失敗: ' + String(e), 'error');
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async () => {
  if (!props.item) return;
  if (!await confirmDialog(`確定移除「${props.item.name}」的追蹤記錄？\n（不刪除實際檔案）`)) return;
  try {
    await api.untrackItem(props.item.path);
    emit('deleted');
    emit('close');
  } catch (e) {
    showToast('刪除失敗: ' + String(e), 'error');
  }
};

const handleMetadataApplied = () => {
  showMetadataLookup.value = false;
  emit('updated');
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
        <span class="big-icon">📁</span>
      </div>

      <div class="info-block">
        <label>名稱</label>
        <input v-model="editName" class="edit-input" @blur="saveChanges" @keydown.enter="saveChanges" />
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
        <button class="btn-open" type="button" @click="showMetadataLookup = true">
          Metadata 查詢 / tags
        </button>
        <h3>自動化</h3>
        <label class="preset-label">預設標籤規則集</label>
        <select v-model="selectedRulePresetId" class="preset-select" :disabled="isSavingPreset || isApplyingPreset">
          <option :value="null">未設定</option>
          <option v-for="t in rulePresetOptions" :key="t.id" :value="t.id">
            {{ t.icon }} {{ t.displayName }}
          </option>
        </select>
        <button class="btn-open" :disabled="isSavingPreset" @click="saveRulePreset">
          {{ isSavingPreset ? '儲存中...' : '儲存預設規則集' }}
        </button>
        <button class="btn-open" :disabled="!selectedRulePreset || isApplyingPreset" @click="applySelectedRulePreset">
          {{ isApplyingPreset ? '套用中...' : '立即套用' }}
        </button>
      </div>

      <div class="actions">
        <h3>操作</h3>
        <button class="btn-open" @click="openFolder">📂 用系統開啟</button>
        <button class="btn-delete" @click="handleDelete">🗑️ 刪除條目</button>
      </div>
    </template>
  </DetailFormLayout>

  <MetadataLookupModal
    :visible="showMetadataLookup"
    :item="item"
    @close="showMetadataLookup = false"
    @applied="handleMetadataApplied"
  />
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

.actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
.actions h3 { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border-default); }

.preset-label {
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.preset-select {
  min-width: 0;
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 8px 10px;
  font-size: 0.9rem;
  outline: none;
}
.preset-select:focus { border-color: var(--accent); }

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
