<script setup lang="ts">
import { type Tag } from '../api';

defineProps<{
  tags: Tag[];
  tagInput: string;
  suggestions: Tag[];
  showSuggestions: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:tagInput', val: string): void;
  (e: 'remove', id: number): void;
  (e: 'submit'): void;
  (e: 'selectSuggestion', tag: Tag): void;
  (e: 'blur'): void;
}>();
</script>

<template>
  <div class="tag-editor">
    <h3>標籤</h3>
    <div class="current-tags">
      <span v-for="tag in tags" :key="tag.id" class="edit-tag">
        # {{ tag.name }}
        <span class="remove" @click="emit('remove', tag.id)">✖</span>
      </span>
    </div>

    <div class="tag-input-wrapper">
      <input
        :value="tagInput"
        class="tag-text-input"
        placeholder="輸入標籤，用 、 或 ， 分隔後按 Enter..."
        @input="emit('update:tagInput', ($event.target as HTMLInputElement).value)"
        @keydown.enter.prevent="emit('submit')"
        @blur="emit('blur')"
      />
      <ul v-if="showSuggestions && suggestions.length" class="tag-suggestions">
        <li
          v-for="s in suggestions"
          :key="s.id"
          @mousedown.prevent="emit('selectSuggestion', s)"
        >
          # {{ s.name }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.tag-editor h3 { font-size: 1rem; margin-bottom: 10px; color: var(--accent-hover); }

.current-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.edit-tag {
  background: var(--accent-bg-subtle);
  border: 1px solid var(--accent);
  color: var(--text-on-accent);
  padding: 4px 10px;
  border-radius: 15px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-tag .remove { cursor: pointer; color: var(--color-danger); font-weight: bold; }
.edit-tag .remove:hover { filter: brightness(1.2); }

.tag-input-wrapper { position: relative; }

.tag-text-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  outline: none;
  font-size: 0.9rem;
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
  max-height: 160px;
  overflow-y: auto;
}

.tag-suggestions li {
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-secondary);
  transition: background 0.15s;
}
.tag-suggestions li:hover { background: var(--bg-overlay-soft); color: var(--text-primary); }
</style>
