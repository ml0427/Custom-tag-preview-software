<script setup lang="ts">
import { ref } from 'vue';
import { type Tag } from '../api';
import { normalizeHex } from '../utils/color';
import TagColorPicker from './TagColorPicker.vue';

const props = defineProps<{
  tag: Tag;
  count?: number;
  isSelected: boolean;
  isColorPickerOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', id: number): void;
  (e: 'rename', id: number, name: string): void;
  (e: 'delete', tag: Tag): void;
  (e: 'setColor', color: string | null): void;
  (e: 'toggleColorPicker'): void;
}>();

const editing = ref(false);
const editName = ref(props.tag.name);

const startRename = () => {
  editing.value = true;
  editName.value = props.tag.name;
};

const submitRename = () => {
  const trimmed = editName.value.trim();
  if (trimmed && trimmed !== props.tag.name) {
    emit('rename', props.tag.id, trimmed);
  }
  editing.value = false;
};

const tagStyle = (color?: string | null) => {
  const safe = normalizeHex(color);
  if (!safe) return {};
  return { background: `${safe}22`, color: safe, borderColor: `${safe}66` };
};
</script>

<template>
  <li :class="{ active: isSelected }">
    <template v-if="editing">
      <div class="tag-edit-row">
        <input
          v-model="editName"
          class="tag-rename-input"
          @click.stop
          @keydown.enter="submitRename"
          @keydown.esc="editing = false"
          @blur="submitRename"
          autofocus
        />
        <button class="icon-btn confirm" @click.stop="submitRename">✓</button>
        <button class="icon-btn cancel" @click.stop="editing = false">✗</button>
      </div>
    </template>

    <template v-else>
      <span
        class="tag-dot"
        :style="tag.color ? { background: tag.color } : {}"
        @click.stop="emit('toggleColorPicker')"
        title="設定顏色"
      ></span>
      <span class="tag-name" @click="emit('select', tag.id)" :style="tagStyle(tag.color)">
        {{ tag.name }}
        <span v-if="count" class="tag-count">({{ count }})</span>
      </span>
      <div class="tag-actions">
        <button class="icon-btn" title="重新命名" @click.stop="startRename">✏️</button>
        <button class="icon-btn danger" title="刪除" @click.stop="emit('delete', tag)">🗑️</button>
      </div>

      <TagColorPicker
        v-if="isColorPickerOpen"
        :tag="tag"
        @select="emit('setColor', $event)"
      />
    </template>
  </li>
</template>

<style scoped>
li {
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 32px;
  position: relative;
}

li:hover { background: var(--bg-hover); }
li.active {
  background: var(--accent-bg-strong);
  color: var(--text-primary);
  border-left: 3px solid var(--accent);
  padding-left: 7px;
}

.tag-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.15s, background 0.15s;
  border: 1px solid rgba(255,255,255,0.15);
}
.tag-dot:hover { transform: scale(1.3); }

.tag-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-count { font-size: 0.78rem; color: var(--text-tertiary); flex-shrink: 0; }
li.active .tag-count { color: var(--text-secondary); }

.tag-actions { display: none; gap: 2px; flex-shrink: 0; }
li:hover .tag-actions { display: flex; }

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
.icon-btn.cancel  { color: var(--color-danger); }
.icon-btn.danger  { color: var(--color-danger); }

.tag-edit-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
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
</style>
