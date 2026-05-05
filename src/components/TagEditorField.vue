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
.tag-editor h3 {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
  margin-bottom: 10px;
}

.current-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.edit-tag {
  font-family: var(--font-jp);
  font-size: 10px;
  padding: 1px 6px 2px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--accent-bg-subtle);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  white-space: nowrap;
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
  border-radius: var(--radius-sm);
  outline: none;
  font-size: 0.85rem;
  font-family: var(--font-mono);
  box-sizing: border-box;
  transition: border-color var(--transition-base);
}
.tag-text-input:focus { border-color: var(--accent); }

.tag-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
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
