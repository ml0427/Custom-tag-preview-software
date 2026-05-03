<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api, type Tag } from '../api';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useToast } from '../composables/useToast';
import { normalizeHex } from '../utils/color';

const props = defineProps<{ selectedTagIds: number[] }>();
const emit = defineEmits<{ (e: 'select', tagIds: number[]): void }>();

const { show: showToast, confirm: confirmDialog } = useToast();
const searchQuery = ref('');

// ─── 顏色自訂 ─────────────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  null,
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#a855f7', '#ec4899', '#6b7280',
];
const colorPickerTagId = ref<number | null>(null);

const openColorPicker = (e: MouseEvent, tagId: number) => {
  e.stopPropagation();
  colorPickerTagId.value = colorPickerTagId.value === tagId ? null : tagId;
};

const closeColorPicker = () => { colorPickerTagId.value = null; };

const applyColor = async (tag: Tag, color: string | null) => {
  const safe = color === null ? null : normalizeHex(color);
  if (color !== null && safe === null) {
    showToast('顏色格式無效（需 #rrggbb 6 碼）', 'error');
    return;
  }
  try {
    const updated = await api.setTagColor(tag.id, safe);
    const idx = tags.value.findIndex(t => t.id === tag.id);
    if (idx !== -1) tags.value[idx] = updated;
  } catch { showToast('設定顏色失敗', 'error'); }
  closeColorPicker();
};

const tagStyle = (color?: string | null) => {
  const safe = normalizeHex(color);
  if (!safe) return {};
  return { background: `${safe}22`, color: safe, borderColor: `${safe}66` };
};

const chipStyle = (tagId: number) => {
  const tag = tags.value.find(t => t.id === tagId);
  return tagStyle(tag?.color);
};

const tags = ref<Tag[]>([]);
const tagCounts = ref<Map<number, number>>(new Map());

// ─── 標籤操作 ────────────────────────────────────────────────────────────────
const editingTagId = ref<number | null>(null);
const editTagName = ref('');
const mergingTagId = ref<number | null>(null);
const showSuggestions = ref(false);

// ─── 新增標籤 ─────────────────────────────────────────────────────────────────
const isAddingTag = ref(false);
const newTagName = ref('');

const startAddTag = () => { isAddingTag.value = true; newTagName.value = ''; };

const submitAddTag = async () => {
  const name = newTagName.value.trim();
  if (!name) { cancelAddTag(); return; }
  try {
    await api.createTag(name);
    await loadTags();
  } catch { showToast('建立標籤失敗', 'error'); }
  finally { cancelAddTag(); }
};

const cancelAddTag = () => { isAddingTag.value = false; newTagName.value = ''; };

const loadTags = async () => {
  const [tagList, counts] = await Promise.all([api.getTags(), api.getTagCounts()]);
  tags.value = tagList;
  tagCounts.value = new Map(counts.map(c => [c.id, c.count]));
};

const handleSelect = (id: number | null) => {
  if (id === null) { emit('select', []); return; }
  const current = props.selectedTagIds;
  if (current.includes(id)) {
    emit('select', current.filter(t => t !== id));
  } else {
    emit('select', [...current, id]);
  }
};

const filteredTags = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return tags.value;
  return tags.value.filter(t => t.name.toLowerCase().includes(q));
});

const startRenameTag = (tag: Tag) => {
  editingTagId.value = tag.id;
  editTagName.value = tag.name;
  mergingTagId.value = null;
};

const submitRenameTag = async (tag: Tag) => {
  const trimmed = editTagName.value.trim();
  if (!trimmed || trimmed === tag.name) { cancelTagEdit(); return; }
  try {
    await api.renameTag(tag.id, trimmed);
    await loadTags();
  } catch { showToast('重新命名失敗', 'error'); }
  finally { cancelTagEdit(); }
};

const handleDeleteTag = async (tag: Tag) => {
  if (!await confirmDialog(`確定刪除標籤「${tag.name}」？`)) return;
  try {
    await api.deleteTag(tag.id);
    if (props.selectedTagIds.includes(tag.id)) emit('select', props.selectedTagIds.filter(id => id !== tag.id));
    await loadTags();
  } catch { showToast('刪除標籤失敗', 'error'); }
};

const cancelTagEdit = () => {
  editingTagId.value = null;
};

const handleGlobalClick = (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('.add-tag')) showSuggestions.value = false;
  if (!(e.target as HTMLElement).closest('.color-picker') && !(e.target as HTMLElement).closest('.tag-dot')) {
    closeColorPicker();
  }
};

let unlistenFns: UnlistenFn[] = [];

onMounted(async () => {
  loadTags();
  document.addEventListener('click', handleGlobalClick);
  unlistenFns.push(await listen('menu-new-tag', async () => {
    const name = prompt('請輸入新標籤名稱：');
    if (!name?.trim()) return;
    try { await api.createTag(name.trim()); await loadTags(); }
    catch { showToast('建立標籤失敗', 'error'); }
  }));
});

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick);
  unlistenFns.forEach(fn => fn());
});
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h2>標籤篩選</h2>
    </div>

    <!-- 搜尋框 -->
    <div class="search-box">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="搜尋標籤..."
      />
    </div>

    <!-- 已選標籤 chip 列 -->
    <div v-if="selectedTagIds.length" class="selected-chips">
      <span
        v-for="id in selectedTagIds"
        :key="id"
        class="chip"
        :style="chipStyle(id)"
      >
        {{ tags.find(t => t.id === id)?.name ?? id }}
        <span class="chip-x" @click="handleSelect(id)">✕</span>
      </span>
    </div>

    <!-- 全部漫畫 -->
    <div class="all-item" :class="{ active: selectedTagIds.length === 0 }" @click="handleSelect(null)">
      🌟 全部漫畫
    </div>

    <!-- 標籤清單 -->
    <ul class="tag-list" @click.stop>
      <li v-for="tag in filteredTags" :key="tag.id" :class="{ active: selectedTagIds.includes(tag.id) }">

        <template v-if="editingTagId === tag.id">
          <div class="tag-edit-row">
            <input v-model="editTagName" class="tag-rename-input" @click.stop
              @keydown.enter="submitRenameTag(tag)" @keydown.esc="cancelTagEdit"
              @blur="submitRenameTag(tag)" autofocus />
            <button class="icon-btn confirm" @click.stop="submitRenameTag(tag)">✓</button>
            <button class="icon-btn cancel" @click.stop="cancelTagEdit">✗</button>
          </div>
        </template>

        <template v-else>
          <span class="tag-dot" :style="tag.color ? { background: tag.color } : {}" @click.stop="openColorPicker($event, tag.id)" title="設定顏色"></span>
          <span class="tag-name" @click="handleSelect(tag.id)" :style="tagStyle(tag.color)">
            {{ tag.name }}
            <span v-if="tagCounts.get(tag.id)" class="tag-count">({{ tagCounts.get(tag.id) }})</span>
          </span>
          <div class="tag-actions">
            <button class="icon-btn" title="重新命名" @click.stop="startRenameTag(tag)">✏️</button>
            <button class="icon-btn danger" title="刪除" @click.stop="handleDeleteTag(tag)">🗑️</button>
          </div>
          <!-- 顏色選擇器 -->
          <div v-if="colorPickerTagId === tag.id" class="color-picker" @click.stop>
            <span
              v-for="c in COLOR_PRESETS"
              :key="c ?? 'none'"
              class="color-swatch"
              :class="{ active: tag.color === c, 'swatch-none': c === null }"
              :style="c ? { background: c } : {}"
              :title="c ?? '預設'"
              @click="applyColor(tag, c)"
            ></span>
          </div>
        </template>
      </li>
    </ul>

    <!-- 新增標籤 footer -->
    <div class="panel-footer">
      <div v-if="isAddingTag" class="add-tag-row">
        <input
          v-model="newTagName"
          class="tag-rename-input"
          placeholder="新標籤名稱"
          @keydown.enter="submitAddTag"
          @keydown.esc="cancelAddTag"
          @blur="cancelAddTag"
          autofocus
        />
        <button class="icon-btn confirm" @mousedown.prevent="submitAddTag">✓</button>
      </div>
      <button v-else class="btn-add-tag" @click="startAddTag">＋ 新增標籤</button>
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
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-secondary);
  font-weight: 600;
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
}

.search-input::placeholder { color: var(--text-secondary); }
.search-input:focus { border-color: var(--accent); }

.all-item {
  margin: 0 12px 6px;
  padding: 8px 10px;
  border-radius: 8px;
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

.tag-list > li {
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
  min-height: 34px;
  position: relative;
}

.tag-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.15s, background 0.15s;
  border: 1px solid rgba(255,255,255,0.15);
}
.tag-dot:hover { transform: scale(1.3); }

.color-picker {
  position: absolute;
  left: 8px;
  top: calc(100% + 4px);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  width: 144px;
  z-index: 200;
  box-shadow: var(--shadow-popover);
}

.color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.12s, border-color 0.12s;
}
.color-swatch:hover { transform: scale(1.2); }
.color-swatch.active { border-color: var(--text-on-accent); }
.swatch-none {
  background: rgba(255,255,255,0.15);
  border: 2px dashed rgba(255,255,255,0.3);
  position: relative;
}
.swatch-none::after {
  content: '✕';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  color: rgba(255,255,255,0.5);
}

.tag-list > li:hover { background: var(--bg-hover); }
.tag-list > li.active {
  background: var(--accent-bg-strong);
  color: var(--text-primary);
  border-left: 3px solid var(--accent);
  padding-left: 7px;
}
.tag-list > li.active .tag-count { color: var(--text-secondary); }

.tag-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 4px; }
.tag-count { font-size: 0.78rem; color: var(--text-tertiary); flex-shrink: 0; }

.tag-actions { display: none; gap: 2px; flex-shrink: 0; }
.tag-list > li:hover .tag-actions { display: flex; }

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

.tag-list::-webkit-scrollbar { width: 8px; }
.tag-list::-webkit-scrollbar-thumb { background: var(--bg-overlay-strong); border-radius: 10px; }

.panel-footer {
  padding: 10px 12px;
  border-top: 1px solid var(--border-default);
  flex-shrink: 0;
}

.btn-add-tag {
  width: 100%;
  padding: 8px;
  border-radius: 8px;
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
</style>
