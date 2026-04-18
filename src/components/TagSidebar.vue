<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { api, type Tag } from '../api';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

const props = defineProps<{
  selectedTagId: number | null
}>();

const emit = defineEmits<{
  (e: 'select', tagId: number | null): void
}>();

const tags = ref<Tag[]>([]);
const newTagName = ref('');
const isScanning = ref(false);

// ─── 自動建議 ────────────────────────────────────────────────────────────────
const suggestions = ref<Tag[]>([]);
const showSuggestions = ref(false);
let suggestionTimer: ReturnType<typeof setTimeout> | null = null;

const onTagInput = () => {
  if (suggestionTimer) clearTimeout(suggestionTimer);
  const q = newTagName.value.trim();
  if (!q) { suggestions.value = []; showSuggestions.value = false; return; }
  suggestionTimer = setTimeout(async () => {
    suggestions.value = await api.searchTags(q);
    showSuggestions.value = suggestions.value.length > 0;
  }, 200);
};

const selectSuggestion = (tag: Tag) => {
  // 直接切換到該標籤篩選，不重複建立
  emit('select', tag.id);
  newTagName.value = '';
  showSuggestions.value = false;
};

const hideSuggestions = () => {
  setTimeout(() => { showSuggestions.value = false; }, 150);
};

// ─── 標籤操作 ────────────────────────────────────────────────────────────────
const editingTagId = ref<number | null>(null);
const editTagName = ref('');
const mergingTagId = ref<number | null>(null);
const mergeTargetId = ref<number | null>(null);

const loadTags = async () => {
  tags.value = await api.getTags();
};

const handleSelect = (id: number | null) => {
  emit('select', id);
};

const handleCreateTag = async () => {
  if (!newTagName.value.trim()) return;
  try {
    await api.createTag(newTagName.value.trim());
    newTagName.value = '';
    showSuggestions.value = false;
    await loadTags();
  } catch {
    alert('建立標籤失敗');
  }
};

// 重新命名
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
  } catch {
    alert('重新命名失敗');
  } finally {
    cancelTagEdit();
  }
};

// 合併
const startMergeTag = (tag: Tag) => {
  mergingTagId.value = tag.id;
  mergeTargetId.value = null;
  editingTagId.value = null;
};

const submitMergeTag = async (tag: Tag) => {
  if (!mergeTargetId.value) { alert('請選擇合併目標'); return; }
  if (!confirm(`確定將「${tag.name}」合併至選定標籤？此操作不可復原。`)) return;
  try {
    await api.mergeTags(tag.id, mergeTargetId.value);
    // 若正在篩選被刪除的標籤，重置為全部
    if (props.selectedTagId === tag.id) emit('select', null);
    await loadTags();
  } catch {
    alert('合併標籤失敗');
  } finally {
    cancelTagEdit();
  }
};

// 刪除
const handleDeleteTag = async (tag: Tag) => {
  if (!confirm(`確定刪除標籤「${tag.name}」？`)) return;
  try {
    await api.deleteTag(tag.id);
    if (props.selectedTagId === tag.id) emit('select', null);
    await loadTags();
  } catch {
    alert('刪除標籤失敗');
  }
};

const cancelTagEdit = () => {
  editingTagId.value = null;
  mergingTagId.value = null;
  mergeTargetId.value = null;
};

// ─── 掃描 ────────────────────────────────────────────────────────────────────
const promptScanPath = () =>
  prompt('請輸入要掃描的資料夾絕對路徑：', 'C:\\Users\\ml042\\Desktop\\自定義標籤預覽軟體\\server\\comic_storage');

const handleScan = async () => {
  const path = promptScanPath();
  if (!path) return;
  isScanning.value = true;
  try {
    const res = await api.scanDirectory(path);
    alert(`完整掃描完成，共新增 ${res.addedCount} 本。`);
    window.location.reload();
  } catch {
    alert('掃描失敗');
  } finally {
    isScanning.value = false;
  }
};

const handleIncrementalScan = async () => {
  const path = promptScanPath();
  if (!path) return;
  isScanning.value = true;
  try {
    const res = await api.incrementalScan(path);
    alert(`增量掃描完成 — 新增 ${res.added}、更新 ${res.updated}、移除 ${res.removed} 本。`);
    window.location.reload();
  } catch {
    alert('增量掃描失敗');
  } finally {
    isScanning.value = false;
  }
};

// 點擊空白處收起建議
const handleGlobalClick = (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('.add-tag')) {
    showSuggestions.value = false;
  }
};

let unlistenFns: UnlistenFn[] = [];

onMounted(async () => {
  loadTags();
  document.addEventListener('click', handleGlobalClick);

  unlistenFns.push(await listen('menu-full-scan', () => handleScan()));
  unlistenFns.push(await listen('menu-incremental-scan', () => handleIncrementalScan()));
  unlistenFns.push(await listen('menu-new-tag', async () => {
    const name = prompt('請輸入新標籤名稱：');
    if (!name?.trim()) return;
    try {
      await api.createTag(name.trim());
      await loadTags();
    } catch {
      alert('建立標籤失敗');
    }
  }));
});

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick);
  unlistenFns.forEach(fn => fn());
});
</script>

<template>
  <aside class="sidebar glass-panel">
    <div class="sidebar-header">
      <h2>🏷️ 標籤篩選</h2>
    </div>

    <!-- 全部漫畫（置頂固定） -->
    <div class="all-comics-item" :class="{ active: selectedTagId === null }" @click="handleSelect(null)">
      🌟 全部漫畫
    </div>

    <!-- 標籤清單 -->
    <ul class="tag-list">
      <li
        v-for="tag in tags"
        :key="tag.id"
        :class="{ active: selectedTagId === tag.id }"
      >
        <!-- 重新命名模式 -->
        <template v-if="editingTagId === tag.id">
          <div class="tag-edit-row">
            <input
              v-model="editTagName"
              class="tag-rename-input"
              @click.stop
              @keydown.enter="submitRenameTag(tag)"
              @keydown.esc="cancelTagEdit"
              @blur="submitRenameTag(tag)"
              autofocus
            />
            <button class="icon-btn confirm" @click.stop="submitRenameTag(tag)" title="確認">✓</button>
            <button class="icon-btn cancel" @click.stop="cancelTagEdit" title="取消">✗</button>
          </div>
        </template>

        <!-- 合併模式 -->
        <template v-else-if="mergingTagId === tag.id">
          <div class="tag-merge-row">
            <span class="merge-label">合併至</span>
            <select v-model="mergeTargetId" class="merge-select" @click.stop>
              <option :value="null" disabled>請選擇...</option>
              <option v-for="t in tags.filter(t => t.id !== tag.id)" :key="t.id" :value="t.id">
                {{ t.name }}
              </option>
            </select>
            <button class="icon-btn confirm" @click.stop="submitMergeTag(tag)" title="確認合併">✓</button>
            <button class="icon-btn cancel" @click.stop="cancelTagEdit" title="取消">✗</button>
          </div>
        </template>

        <!-- 一般模式 -->
        <template v-else>
          <span class="tag-name" @click="handleSelect(tag.id)">
            # {{ tag.name }}
          </span>
          <div class="tag-actions">
            <button class="icon-btn" title="重新命名" @click.stop="startRenameTag(tag)">✏️</button>
            <button class="icon-btn" title="合併至其他標籤" @click.stop="startMergeTag(tag)">🔀</button>
            <button class="icon-btn danger" title="刪除" @click.stop="handleDeleteTag(tag)">🗑️</button>
          </div>
        </template>
      </li>
    </ul>

    <div v-if="isScanning" class="scanning-indicator">⏳ 掃描中...</div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 250px;
  height: calc(100vh - 40px);
  margin: 20px 0 20px 20px;
  display: flex;
  flex-direction: column;
  padding: 20px;
  flex-shrink: 0;
}

.sidebar-header h2 {
  font-size: 1.2rem;
  margin-bottom: 20px;
  color: var(--text-primary);
}

/* ─── 新增標籤區 ────────────────────────────────────────────────────── */
.add-tag {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  position: relative;
}

.input-wrapper {
  flex-grow: 1;
  position: relative;
}

.input-wrapper input {
  width: 100%;
  box-sizing: border-box;
}

.suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #1e2230;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  list-style: none;
  padding: 4px 0;
  z-index: 200;
  box-shadow: 0 8px 20px rgba(0,0,0,0.4);
  max-height: 180px;
  overflow-y: auto;
}

.suggestions li {
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-secondary);
  transition: background 0.15s;
}

.suggestions li:hover {
  background: rgba(255,255,255,0.07);
  color: var(--text-primary);
}

/* ─── 全部漫畫置頂項 ────────────────────────────────────────────────── */
.all-comics-item {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-primary);
  transition: all var(--transition-speed, 0.2s) ease;
  margin-bottom: 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--panel-border);
  padding-bottom: 12px;
}

.all-comics-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.all-comics-item.active {
  background: var(--tag-bg);
  color: var(--accent-hover);
  border-left: 3px solid var(--accent-color);
  padding-left: 7px;
}

/* ─── 標籤清單 ──────────────────────────────────────────────────────── */
.tag-list {
  list-style: none;
  overflow-y: auto;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tag-list > li {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--transition-speed, 0.2s) ease;
  font-weight: 500;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 36px;
}

.tag-list > li:hover {
  background: rgba(255, 255, 255, 0.05);
}

.tag-list > li.active {
  background: var(--tag-bg);
  color: var(--accent-hover);
  border-left: 3px solid var(--accent-color);
  padding-left: 7px;
}

.tag-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 操作按鈕（hover 才顯示） */
.tag-actions {
  display: none;
  gap: 2px;
  flex-shrink: 0;
}

.tag-list > li:hover .tag-actions {
  display: flex;
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

.icon-btn:hover {
  opacity: 1;
  background: rgba(255,255,255,0.1);
}

.icon-btn.confirm { color: #4ade80; }
.icon-btn.cancel  { color: #f87171; }
.icon-btn.danger  { color: var(--danger-color, #f87171); }

/* 重新命名行 */
.tag-edit-row,
.tag-merge-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.tag-rename-input,
.merge-select {
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

.merge-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.scanning-indicator {
  margin-top: 12px;
  padding: 8px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--accent-color);
  border-top: 1px solid var(--panel-border);
}

/* Scrollbar */
.tag-list::-webkit-scrollbar { width: 4px; }
.tag-list::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 10px;
}
</style>
