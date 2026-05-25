<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { api, type Tag } from '../api';
import { useToast } from '../composables/useToast';
import { useTags } from '../composables/useTags';
import TagItem from './TagItem.vue';
import { normalizeHex } from '../utils/color';

const props = defineProps<{ selectedTagId: number | null }>();
const emit = defineEmits<{ (e: 'select', tagId: number | null): void }>();

const { show: showToast, confirm: confirmDialog } = useToast();
const {
  tags, tagCounts, searchQuery, filteredTags,
  loadTags, createTag, renameTag, deleteTag, setTagColor
} = useTags();

const colorPickerTagId = ref<number | null>(null);
const isAddingTag = ref(false);
const newTagName = ref('');

const toggleColorPicker = (tagId: number) => {
  colorPickerTagId.value = colorPickerTagId.value === tagId ? null : tagId;
};

const closeColorPicker = () => { colorPickerTagId.value = null; };

const chipStyle = (tagId: number) => {
  const tag = tags.value.find(t => t.id === tagId);
  const safe = normalizeHex(tag?.color);
  if (!safe) return {};
  return { background: `${safe}22`, color: safe, borderColor: `${safe}66` };
};

const handleSelect = (id: number | null) => {
  if (id === null) { emit('select', null); return; }
  if (props.selectedTagId === id) {
    emit('select', null);
  } else {
    emit('select', id);
  }
};

const submitAddTag = async () => {
  const name = newTagName.value.trim();
  if (name) await createTag(name);
  isAddingTag.value = false;
  newTagName.value = '';
};

const handleDeleteTag = async (tag: Tag) => {
  if (!await confirmDialog(`確定刪除標籤「${tag.name}」？`)) return;
  await deleteTag(tag.id);
  if (props.selectedTagId === tag.id) {
    emit('select', null);
  }
};

const handleGlobalClick = (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('.color-picker') && !(e.target as HTMLElement).closest('.tag-dot')) {
    closeColorPicker();
  }
};

onMounted(() => {
  loadTags();
  document.addEventListener('click', handleGlobalClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick);
});
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h2>標籤篩選</h2>
    </div>

    <div class="search-box">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="搜尋標籤..."
      />
    </div>

    <div v-if="selectedTagId != null" class="selected-chips">
      <span
        class="chip"
        :style="chipStyle(selectedTagId!)"
      >
        {{ tags.find(t => t.id === selectedTagId)?.name ?? selectedTagId }}
        <span class="chip-x" @click="handleSelect(selectedTagId!)">✕</span>
      </span>
    </div>

    <div class="all-item" :class="{ active: selectedTagId == null }" @click="handleSelect(null)">
      🌟 全部漫畫
    </div>

    <ul class="tag-list" @click.stop>
      <TagItem
        v-for="tag in filteredTags"
        :key="tag.id"
        :tag="tag"
        :count="tagCounts.get(tag.id)"
        :isSelected="selectedTagId === tag.id"
        :isColorPickerOpen="colorPickerTagId === tag.id"
        @select="handleSelect"
        @rename="renameTag"
        @delete="handleDeleteTag"
        @setColor="setTagColor(tag.id, $event)"
        @toggleColorPicker="toggleColorPicker(tag.id)"
      />
    </ul>

    <div class="panel-footer">
      <div v-if="isAddingTag" class="add-tag-row">
        <input
          v-model="newTagName"
          class="tag-rename-input"
          placeholder="新標籤名稱"
          @keydown.enter="submitAddTag"
          @keydown.esc="isAddingTag = false"
          @blur="submitAddTag"
          autofocus
        />
        <button class="icon-btn confirm" @mousedown.prevent="submitAddTag">✓</button>
      </div>
      <button v-else class="btn-add-tag" @click="isAddingTag = true">＋ 新增標籤</button>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  padding: 20px 16px 12px;
  border-bottom: 1px solid var(--border-default);
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

.search-box {
  padding: 8px 12px 4px;
  flex-shrink: 0;
}

.selected-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 12px 2px;
  flex-shrink: 0;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--accent-bg-strong);
  border: 1px solid var(--accent);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  font-size: 0.78rem;
  color: var(--text-primary);
  white-space: nowrap;
}
.chip-x {
  cursor: pointer;
  font-size: 0.7rem;
  opacity: 0.7;
  line-height: 1;
}
.chip-x:hover { opacity: 1; }

.search-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 6px 10px;
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s;
  font-family: var(--font-mono);
}

.search-input::placeholder { color: var(--text-secondary); }
.search-input:focus { border-color: var(--accent); }

.all-item {
  margin: 0 12px 6px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
  transition: all 0.2s;
  flex-shrink: 0;
}

.all-item:hover { background: var(--bg-hover); }
.all-item.active {
  background: var(--accent-bg-strong);
  color: var(--text-primary);
  border-left: 3px solid var(--accent);
  padding-left: 7px;
}

.tag-list {
  list-style: none;
  overflow-y: auto;
  flex: 1;
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tag-list::-webkit-scrollbar { width: 4px; }
.tag-list::-webkit-scrollbar-thumb { background: var(--bg-overlay-strong); border-radius: 10px; }

.panel-footer {
  padding: 10px 12px;
  border-top: 1px solid var(--border-default);
  flex-shrink: 0;
}

.btn-add-tag {
  width: 100%;
  padding: 8px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 500;
  background: var(--bg-overlay-soft);
  border: 1px dashed var(--border-default);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.btn-add-tag:hover {
  background: var(--accent-bg-subtle);
  border-color: var(--accent);
  color: var(--accent-hover);
}

.add-tag-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-rename-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text-primary);
  padding: 3px 6px;
  font-size: 0.85rem;
  outline: none;
  min-width: 0;
}

.icon-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 2px 4px;
  border-radius: 4px;
  opacity: 0.7;
  transition: opacity 0.15s, background 0.15s;
  line-height: 1;
}
.icon-btn:hover { opacity: 1; background: var(--bg-overlay-strong); }
.icon-btn.confirm { color: var(--color-success); }
</style>
