<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, type FolderRulePreset, type Item, type Tag } from '../api';
import { useItemTypes } from '../composables/useItemTypes';
import { useTagManager } from '../composables/useTagManager';
import { useToast } from '../composables/useToast';
import { getPreviewEditCapabilities } from '../utils/previewEdit';
import TagEditorField from './TagEditorField.vue';

const props = defineProps<{
  item: Item;
  allTags: Tag[];
}>();

const emit = defineEmits<{
  (e: 'updated'): void;
  (e: 'tagsChanged'): void;
}>();

const { show: showToast } = useToast();
const { itemTypes, load: loadItemTypes, getTypeConfig } = useItemTypes();

const editName = ref('');
const editNote = ref('');
const editCategory = ref('default');
const isSavingName = ref(false);
const isSavingNote = ref(false);
const isSavingCategory = ref(false);
const isLoadingImages = ref(false);
const zipImages = ref<string[]>([]);
const isSettingCover = ref(false);
const isSavingPreset = ref(false);
const isApplyingPreset = ref(false);
const rulePreset = ref<FolderRulePreset | null>(null);
const selectedRulePresetId = ref<number | null>(null);

const capabilities = computed(() => getPreviewEditCapabilities(props.item));
const rulePresetOptions = computed(() => itemTypes.value.filter(t => t.tagRules?.length));
const selectedRulePreset = computed(() => (
  selectedRulePresetId.value == null
    ? null
    : itemTypes.value.find(t => t.id === selectedRulePresetId.value) ?? null
));
const selectedCategoryConfig = computed(() => getTypeConfig(editCategory.value));

const {
  localTags,
  tagInput,
  suggestions: tagInputSuggestions,
  showSuggestions: showTagInputSuggestions,
  initTags,
  onInputChange: onTagInputChange,
  submitInput: submitTagInput,
  selectSuggestion: selectTagSuggestion,
  removeTagById: removeTag,
  hideSuggestions: hideTagSuggestions,
} = useTagManager({
  getEntityId: () => props.item.id,
  addTag: (id, tagId) => api.tagItem(id, tagId),
  removeTag: (id, tagId) => api.untagItem(id, tagId),
  onUpdated: () => {
    emit('updated');
    emit('tagsChanged');
  },
});

const handleTagInputUpdate = (value: string) => {
  tagInput.value = value;
  onTagInputChange();
};

const isArchive = (path: string) => /\.(zip|cbz)$/i.test(path);

const loadImages = async () => {
  zipImages.value = [];
  if (!capabilities.value.canEditCoverImages || !isArchive(props.item.path)) return;

  isLoadingImages.value = true;
  try {
    zipImages.value = await api.getItemImages(props.item.id);
  } catch {
    showToast('圖片載入失敗', 'error');
  } finally {
    isLoadingImages.value = false;
  }
};

const loadRulePreset = async () => {
  rulePreset.value = null;
  selectedRulePresetId.value = null;
  if (!capabilities.value.canEditFolderRules) return;

  try {
    rulePreset.value = await api.getFolderRulePreset(props.item.id);
    selectedRulePresetId.value = rulePreset.value?.presetTypeId ?? null;
  } catch (e) {
    showToast('讀取預設規則集失敗: ' + String(e), 'error');
  }
};

const resetLocalState = async (item: Item) => {
  initTags(item.tags);
  editName.value = item.name;
  editNote.value = item.note ?? '';
  editCategory.value = item.category ?? 'default';
  await loadItemTypes();
  await Promise.all([loadImages(), loadRulePreset()]);
};

watch(() => props.item, item => {
  resetLocalState(item);
}, { immediate: true });

const saveName = async () => {
  const newName = editName.value.trim();
  if (!newName || newName === props.item.name || isSavingName.value) return;
  isSavingName.value = true;
  try {
    await api.setItemDisplayName(props.item.id, newName);
    showToast('名稱已更新', 'success');
    emit('updated');
  } catch (e) {
    showToast('儲存名稱失敗: ' + String(e), 'error');
    editName.value = props.item.name;
  } finally {
    isSavingName.value = false;
  }
};

const saveNote = async () => {
  if (!capabilities.value.canEditNote || isSavingNote.value) return;
  const newNote = editNote.value.trim();
  if (newNote === (props.item.note ?? '')) return;
  isSavingNote.value = true;
  try {
    await api.setItemNote(props.item.id, newNote);
    showToast('備註已更新', 'success');
    emit('updated');
  } catch (e) {
    showToast('儲存備註失敗: ' + String(e), 'error');
    editNote.value = props.item.note ?? '';
  } finally {
    isSavingNote.value = false;
  }
};

const saveCategory = async () => {
  if (!capabilities.value.canEditCategory || isSavingCategory.value) return;
  isSavingCategory.value = true;
  try {
    await api.setItemCategory(props.item.id, editCategory.value);
    const type = itemTypes.value.find(t => t.name === editCategory.value);
    if (type?.tagRules?.length) {
      await api.applyRulesToItem(props.item.id, type.tagRules);
    }
    showToast('類別已更新', 'success');
    emit('updated');
    emit('tagsChanged');
  } catch (e) {
    showToast('儲存類別失敗: ' + String(e), 'error');
    editCategory.value = props.item.category ?? 'default';
  } finally {
    isSavingCategory.value = false;
  }
};

const saveRulePreset = async () => {
  if (!capabilities.value.canEditFolderRules || isSavingPreset.value) return;
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
  if (!capabilities.value.canEditFolderRules || isApplyingPreset.value) return;
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
    emit('tagsChanged');
  } catch (e) {
    showToast('套用預設規則集失敗: ' + String(e), 'error');
  } finally {
    isApplyingPreset.value = false;
  }
};

const handleSetCover = async (imagePath: string) => {
  if (!capabilities.value.canEditCoverImages || isSettingCover.value) return;
  isSettingCover.value = true;
  try {
    await api.setItemCover(props.item.id, imagePath);
    showToast('封面已更新', 'success');
    emit('updated');
  } catch (e) {
    showToast('封面更新失敗: ' + String(e), 'error');
  } finally {
    isSettingCover.value = false;
  }
};
</script>

<template>
  <div class="preview-edit-panel">
    <section class="edit-section">
      <h3>基本資料</h3>
      <label class="field-block">
        <span>名稱</span>
        <input
          v-model="editName"
          class="edit-input"
          :disabled="isSavingName"
          @blur="saveName"
          @keydown.enter="saveName"
        />
      </label>

      <label v-if="capabilities.canEditNote" class="field-block">
        <span>備註</span>
        <textarea
          v-model="editNote"
          class="edit-input edit-textarea"
          :disabled="isSavingNote"
          rows="3"
          placeholder="輸入備註..."
          @blur="saveNote"
        ></textarea>
      </label>

      <label v-if="capabilities.canEditCategory" class="field-block">
        <span>類別</span>
        <div class="category-row">
          <span class="category-icon">{{ selectedCategoryConfig.icon }}</span>
          <select v-model="editCategory" class="edit-input" :disabled="isSavingCategory">
            <option v-for="type in itemTypes" :key="type.name" :value="type.name">
              {{ type.icon }} {{ type.displayName }}
            </option>
          </select>
        </div>
      </label>

      <button
        v-if="capabilities.canEditCategory"
        class="panel-btn primary"
        type="button"
        :disabled="isSavingCategory"
        @click="saveCategory"
      >
        {{ isSavingCategory ? '儲存中...' : '儲存類別' }}
      </button>
    </section>

    <section v-if="capabilities.canEditTags" class="edit-section">
      <TagEditorField
        :tags="localTags"
        :tagInput="tagInput"
        :suggestions="tagInputSuggestions"
        :showSuggestions="showTagInputSuggestions"
        @update:tagInput="handleTagInputUpdate"
        @remove="removeTag"
        @submit="submitTagInput"
        @selectSuggestion="selectTagSuggestion"
        @blur="hideTagSuggestions"
      />
    </section>

    <section v-if="capabilities.canEditFolderRules" class="edit-section">
      <h3>自動化</h3>
      <label class="field-block">
        <span>預設標籤規則集</span>
        <select v-model="selectedRulePresetId" class="edit-input" :disabled="isSavingPreset || isApplyingPreset">
          <option :value="null">未設定</option>
          <option v-for="type in rulePresetOptions" :key="type.id" :value="type.id">
            {{ type.icon }} {{ type.displayName }}
          </option>
        </select>
      </label>
      <div class="button-row">
        <button class="panel-btn" type="button" :disabled="isSavingPreset" @click="saveRulePreset">
          {{ isSavingPreset ? '儲存中...' : '儲存規則集' }}
        </button>
        <button class="panel-btn" type="button" :disabled="!selectedRulePreset || isApplyingPreset" @click="applySelectedRulePreset">
          {{ isApplyingPreset ? '套用中...' : '立即套用' }}
        </button>
      </div>
    </section>

    <section v-if="capabilities.canEditCoverImages" class="edit-section">
      <h3>封面</h3>
      <p v-if="isLoadingImages" class="hint-line">載入圖片中...</p>
      <p v-else-if="!zipImages.length" class="hint-line">此檔案沒有可選的內部圖片。</p>
      <div v-else class="image-list">
        <div v-for="image in zipImages" :key="image" class="image-row">
          <span>{{ image }}</span>
          <button class="panel-btn compact" type="button" :disabled="isSettingCover" @click="handleSetCover(image)">
            設為封面
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.preview-edit-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-edit-panel::-webkit-scrollbar { width: 4px; }
.preview-edit-panel::-webkit-scrollbar-thumb { background: var(--bg-overlay-strong); border-radius: 10px; }

.edit-section {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.edit-section h3 {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.field-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-block span {
  min-width: 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.edit-input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.86rem;
  font-family: inherit;
  outline: none;
}

.edit-input:focus {
  border-color: var(--accent);
}

.edit-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.edit-textarea {
  resize: vertical;
  line-height: 1.5;
}

.category-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-icon {
  flex: 0 0 auto;
  font-size: 1.25rem;
}

.button-row {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.panel-btn {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-overlay-soft);
  color: var(--text-primary);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.panel-btn.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--text-on-accent);
}

.panel-btn.compact {
  flex: 0 0 auto;
  font-size: 0.76rem;
  padding: 5px 8px;
}

.panel-btn:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent-bg-subtle);
  color: var(--accent);
}

.panel-btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  color: var(--text-on-accent);
}

.panel-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.hint-line {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 0.82rem;
  line-height: 1.5;
}

.image-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-overlay-soft);
}

.image-row span {
  min-width: 0;
  flex: 1;
  color: var(--text-secondary);
  font-size: 0.78rem;
  overflow-wrap: anywhere;
}
</style>
