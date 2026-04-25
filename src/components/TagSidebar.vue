<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api, type Tag } from '../api';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useToast } from '../composables/useToast';

const props = defineProps<{ selectedTagId: number | null }>();
const emit = defineEmits<{ (e: 'select', tagId: number | null): void }>();

const { show: showToast, confirm: confirmDialog } = useToast();
const searchQuery = ref('');

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

const handleSelect = (id: number | null) => emit('select', id);

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
    if (props.selectedTagId === tag.id) emit('select', null);
    await loadTags();
  } catch { showToast('刪除標籤失敗', 'error'); }
};

const cancelTagEdit = () => {
  editingTagId.value = null;
};

const handleGlobalClick = (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('.add-tag')) showSuggestions.value = false;
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

    <!-- 全部漫畫 -->
    <div class="all-item" :class="{ active: selectedTagId === null }" @click="handleSelect(null)">
      🌟 全部漫畫
    </div>

    <!-- 標籤清單 -->
    <ul class="tag-list" @click.stop>
      <li v-for="tag in filteredTags" :key="tag.id" :class="{ active: selectedTagId === tag.id }">

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
          <span class="tag-name" @click="handleSelect(tag.id)">
            # {{ tag.name }}
            <span v-if="tagCounts.get(tag.id)" class="tag-count">({{ tagCounts.get(tag.id) }})</span>
          </span>
          <div class="tag-actions">
            <button class="icon-btn" title="重新命名" @click.stop="startRenameTag(tag)">✏️</button>
            <button class="icon-btn danger" title="刪除" @click.stop="handleDeleteTag(tag)">🗑️</button>
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
  border-bottom: 1px solid var(--panel-border);
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

.search-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 6px 10px;
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-input::placeholder { color: var(--text-secondary); }
.search-input:focus { border-color: var(--accent-color); }

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

.all-item:hover { background: rgba(255,255,255,0.07); }
.all-item.active {
  background: rgba(47, 129, 247, 0.30);
  color: #fff;
  border-left: 3px solid var(--accent-color);
  padding-left: 7px;
}
.all-item.active:hover { background: rgba(47, 129, 247, 0.40); }

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
}

.tag-list > li:hover { background: rgba(255,255,255,0.07); }
.tag-list > li.active {
  background: rgba(47, 129, 247, 0.30);
  color: #fff;
  border-left: 3px solid var(--accent-color);
  padding-left: 7px;
}
.tag-list > li.active:hover { background: rgba(47, 129, 247, 0.40); }
.tag-list > li.active .tag-count { color: rgba(255,255,255,0.65); }

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

.icon-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
.icon-btn.confirm { color: #4ade80; }
.icon-btn.cancel  { color: #f87171; }
.icon-btn.danger  { color: var(--danger-color); }

.tag-edit-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.tag-rename-input {
  flex: 1;
  background: rgba(0,0,0,0.4);
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  color: #fff;
  padding: 3px 6px;
  font-size: 0.85rem;
  outline: none;
  min-width: 0;
}

.tag-list::-webkit-scrollbar { width: 8px; }
.tag-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }

.panel-footer {
  padding: 10px 12px;
  border-top: 1px solid var(--panel-border);
  flex-shrink: 0;
}

.btn-add-tag {
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  background: rgba(255,255,255,0.04);
  border: 1px dashed rgba(255,255,255,0.15);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.btn-add-tag:hover {
  background: rgba(47,129,247,0.1);
  border-color: var(--accent-color);
  color: var(--accent-hover);
}

.add-tag-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
