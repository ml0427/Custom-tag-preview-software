<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api, type Item, type Tag } from '../api';
import { useTagManager } from '../composables/useTagManager';
import { useToast } from '../composables/useToast';
import { useItemTypes } from '../composables/useItemTypes';

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
const isVisible = computed(() => props.item !== null);
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
  <div class="modal-backdrop" v-if="isVisible" @click.self="emit('close')">
    <div class="modal-content glass-panel">
      <button class="close-btn" @click="emit('close')">✖</button>

      <div v-if="item" class="modal-body">
        <div class="modal-left">
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

          <div class="tag-editor">
            <h3>標籤</h3>
            <div class="current-tags">
              <span v-for="tag in localTags" :key="tag.id" class="edit-tag">
                # {{ tag.name }}
                <span class="remove" @click="removeTag(tag.id)">✖</span>
              </span>
            </div>
            <div class="tag-input-wrapper">
              <input
                v-model="tagInput"
                class="tag-text-input"
                placeholder="輸入標籤後按 Enter..."
                @input="onTagInputChange"
                @keydown.enter.prevent="submitTagInput"
                @blur="hideTagSuggestions"
              />
              <ul v-if="showTagInputSuggestions && tagInputSuggestions.length" class="tag-suggestions">
                <li v-for="s in tagInputSuggestions" :key="s.id" @mousedown.prevent="selectTagSuggestion(s)">
                  # {{ s.name }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="modal-right">
          <h2 class="title">{{ item.name }}</h2>
          <p class="file-path">{{ item.path }}</p>

          <div class="actions">
            <button class="btn-open" @click="openFolder">📂 用系統開啟</button>
            <button class="btn-delete" @click="handleDelete">🗑️ 刪除條目</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--bg-scrim-heavy);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.25s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal-content {
  width: 80%;
  max-width: 820px;
  height: 80vh;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  animation: slideUp 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
@keyframes slideUp {
  from { transform: translateY(24px) scale(0.98); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}

.close-btn {
  position: absolute;
  top: 14px; right: 14px;
  background: transparent;
  color: var(--text-on-accent);
  font-size: 1.3rem;
  padding: 4px 9px;
  border-radius: 50%;
  z-index: 10;
  transition: background 0.15s, transform 0.2s;
}
.close-btn:hover { background: var(--bg-overlay-strong); transform: rotate(90deg); }

.modal-body {
  display: flex;
  height: 100%;
  padding: 28px;
  gap: 28px;
  overflow: hidden;
}

.modal-left {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

.folder-icon-area {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 0 10px;
}
.big-icon { font-size: 4rem; line-height: 1; }

.info-block { display: flex; flex-direction: column; gap: 4px; }
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

.tag-editor h3 { font-size: 0.9rem; margin-bottom: 8px; color: var(--accent-hover); }
.current-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }

.edit-tag {
  background: var(--accent-bg-subtle);
  border: 1px solid var(--accent);
  color: var(--text-on-accent);
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.82rem;
  display: flex;
  align-items: center;
  gap: 6px;
}
.edit-tag .remove { cursor: pointer; color: var(--color-danger); }

.tag-input-wrapper { position: relative; }
.tag-text-input {
  width: 100%;
  padding: 7px 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  outline: none;
  font-size: 0.88rem;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.tag-text-input:focus { border-color: var(--accent); }

.tag-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  list-style: none;
  padding: 4px 0;
  z-index: 200;
  box-shadow: var(--shadow-popover);
  max-height: 140px;
  overflow-y: auto;
}
.tag-suggestions li {
  padding: 7px 14px;
  cursor: pointer;
  font-size: 0.88rem;
  color: var(--text-secondary);
  transition: background 0.15s;
}
.tag-suggestions li:hover { background: var(--bg-overlay-soft); color: var(--text-primary); }

.modal-right { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.title { font-size: 1.6rem; margin-bottom: 6px; line-height: 1.3; }
.file-path { font-size: 0.78rem; color: var(--text-secondary); word-break: break-all; margin-bottom: 24px; }

.actions { display: flex; flex-direction: column; gap: 10px; }

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
.btn-delete:hover { background: rgba(248,113,113,0.1); }
</style>
