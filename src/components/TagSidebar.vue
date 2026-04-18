<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api, type Tag } from '../api';

const props = defineProps<{
  selectedTagId: number | null
}>();

const emit = defineEmits<{
  (e: 'select', tagId: number | null): void
}>();

const tags = ref<Tag[]>([]);
const newTagName = ref('');
const isScanning = ref(false);

const loadTags = async () => {
    tags.value = await api.getTags();
};

const handleSelect = (id: number | null) => {
    emit('select', id);
};

const handleCreateTag = async () => {
    if (!newTagName.value.trim()) return;
    try {
        await api.createTag(newTagName.value);
        newTagName.value = '';
        await loadTags();
    } catch (e) {
        alert('Failed to create tag');
    }
};

const handleScan = async () => {
    const path = prompt("Enter the absolute folder path to scan for ZIP comics:", "C:\\Users\\ml042\\Desktop\\自定義標籤預覽軟體\\server\\comic_storage");
    if (!path) return;
    
    isScanning.value = true;
    try {
        const res = await api.scanDirectory(path);
        alert(`Scan completed. Added ${res.addedCount} new comics!`);
        window.location.reload(); // Refresh to show new comics
    } catch (e) {
        alert('Failed to scan directory');
    } finally {
        isScanning.value = false;
    }
};

onMounted(() => {
    loadTags();
});
</script>

<template>
  <aside class="sidebar glass-panel">
    <div class="sidebar-header">
      <h2>🏷️ 標籤篩選</h2>
    </div>
    
    <div class="add-tag">
      <input 
        v-model="newTagName" 
        type="text" 
        placeholder="輸入新標籤名稱..." 
        @keyup.enter="handleCreateTag" 
      />
      <button class="btn-primary" @click="handleCreateTag">新增</button>
    </div>

    <ul class="tag-list">
      <li 
        :class="{ active: selectedTagId === null }" 
        @click="handleSelect(null)"
      >
        🌟 全部漫畫
      </li>
      <li 
        v-for="tag in tags" 
        :key="tag.id" 
        :class="{ active: selectedTagId === tag.id }"
        @click="handleSelect(tag.id)"
      >
        # {{ tag.name }}
      </li>
    </ul>

    <div class="tools">
      <button class="btn-primary" :disabled="isScanning" @click="handleScan" style="width: 100%;">
        {{ isScanning ? '掃描中...' : '📂 掃描本地資料夾' }}
      </button>
    </div>
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

.add-tag {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.add-tag input {
  flex-grow: 1;
}

.tag-list {
  list-style: none;
  overflow-y: auto;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-list li {
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--transition-speed) ease;
  font-weight: 500;
  color: var(--text-secondary);
}

.tag-list li:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.tag-list li.active {
  background: var(--tag-bg);
  color: var(--accent-hover);
  border-left: 3px solid var(--accent-color);
  padding-left: 11px;
}

.tools {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--panel-border);
}
</style>
