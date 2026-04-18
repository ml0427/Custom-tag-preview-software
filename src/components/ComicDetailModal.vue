<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api, type Comic, type Tag } from '../api';

const props = defineProps<{
  comic: Comic | null;
  allTags: Tag[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
}>();

const isVisible = computed(() => props.comic !== null);
const isLoadingImages = ref(false);
const zipImages = ref<string[]>([]);
const isSettingCover = ref(false);

// 本地標籤副本，操作後立即更新 UI，不依賴後端 roundtrip
const localTags = ref<Tag[]>([]);
watch(() => props.comic, (comic) => {
    localTags.value = comic ? [...comic.tags] : [];
}, { immediate: true });

const coverUrl = ref('');

const loadCover = async () => {
    if (!props.comic) { coverUrl.value = ''; return; }
    try {
        coverUrl.value = await api.getCoverBase64(props.comic.id);
    } catch {
        coverUrl.value = '';
    }
};

const loadImages = async () => {
    if (!props.comic) return;
    isLoadingImages.value = true;
    try {
        zipImages.value = await api.getComicImages(props.comic.id);
    } catch (e) {
        alert('Failed to load images from ZIP');
    } finally {
        isLoadingImages.value = false;
    }
};

const handleSetCover = async (imagePath: string) => {
    if (!props.comic) return;
    isSettingCover.value = true;
    try {
        await api.setComicCover(props.comic.id, imagePath);
        alert('Cover updated successfully!');
        await loadCover(); // 重新載入封面
        emit('updated');
    } catch (e) {
        alert('Failed to update cover');
    } finally {
        isSettingCover.value = false;
    }
};

const addTag = async (event: Event) => {
    const select = event.target as HTMLSelectElement;
    const tagId = Number(select.value);
    if (!tagId || !props.comic) return;
    try {
        await api.addTagToComic(props.comic.id, tagId);
        emit('updated');
    } catch (e) {
        alert('Failed to add tag');
    }
    select.value = "";
};

// 手動輸入標籤
const tagInput = ref('');
const tagInputSuggestions = ref<import('../api').Tag[]>([]);
const showTagInputSuggestions = ref(false);
let tagInputTimer: ReturnType<typeof setTimeout> | null = null;

const onTagInputChange = () => {
    if (tagInputTimer) clearTimeout(tagInputTimer);
    const q = tagInput.value.trim();
    if (!q) { tagInputSuggestions.value = []; showTagInputSuggestions.value = false; return; }
    tagInputTimer = setTimeout(async () => {
        tagInputSuggestions.value = await api.searchTags(q);
        showTagInputSuggestions.value = true;
    }, 200);
};

const submitTagInput = async () => {
    const name = tagInput.value.trim();
    if (!name || !props.comic) return;
    tagInput.value = '';
    tagInputSuggestions.value = [];
    showTagInputSuggestions.value = false;
    try {
        const existing = tagInputSuggestions.value.find(t => t.name.toLowerCase() === name.toLowerCase());
        let tag: Tag;
        if (existing) {
            tag = existing;
        } else {
            tag = await api.createTag(name);
        }
        // 避免重複新增
        if (localTags.value.some(t => t.id === tag.id)) return;
        await api.addTagToComic(props.comic.id, tag.id);
        localTags.value = [...localTags.value, tag];
        emit('updated');
    } catch (e) {
        alert('新增標籤失敗: ' + String(e));
    }
};

const selectTagSuggestion = async (tag: Tag) => {
    if (!props.comic) return;
    if (localTags.value.some(t => t.id === tag.id)) return;
    tagInput.value = '';
    tagInputSuggestions.value = [];
    showTagInputSuggestions.value = false;
    try {
        await api.addTagToComic(props.comic.id, tag.id);
        localTags.value = [...localTags.value, tag];
        emit('updated');
    } catch (e) {
        alert('新增標籤失敗: ' + String(e));
    }
};

const hideTagSuggestions = () => {
    setTimeout(() => { showTagInputSuggestions.value = false; }, 150);
};

const removeTag = async (tagId: number) => {
    if (!props.comic) return;
    try {
        await api.removeTagFromComic(props.comic.id, tagId);
        localTags.value = localTags.value.filter(t => t.id !== tagId);
        emit('updated');
    } catch (e) {
        alert('移除標籤失敗: ' + String(e));
    }
};

const availableTags = computed(() => {
    if (!props.allTags) return [];
    const currentTagIds = new Set(localTags.value.map(t => t.id));
    return props.allTags.filter(t => !currentTagIds.has(t.id));
});

watch(() => props.comic, (newComic) => {
    zipImages.value = [];
    if (newComic) {
        loadCover();
        loadImages();
    }
}, { immediate: true });

</script>

<template>
  <div class="modal-backdrop" v-if="isVisible" @click.self="emit('close')">
    <div class="modal-content glass-panel">
      <button class="close-btn" @click="emit('close')">✖</button>
      
      <div v-if="comic" class="modal-body">
        <div class="modal-left">
          <img :src="coverUrl" alt="Cover" class="large-cover" />
          
          <div class="tag-editor">
            <h3>目前標籤</h3>
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
                placeholder="輸入標籤名稱後按 Enter..."
                @input="onTagInputChange"
                @keydown.enter.prevent="submitTagInput"
                @blur="hideTagSuggestions"
              />
              <ul v-if="showTagInputSuggestions && tagInputSuggestions.length" class="tag-suggestions">
                <li
                  v-for="s in tagInputSuggestions"
                  :key="s.id"
                  @mousedown.prevent="selectTagSuggestion(s)"
                >
                  # {{ s.name }}
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <div class="modal-right">
          <h2 class="title" :title="comic.title">{{ comic.title }}</h2>
          <p class="file-path">{{ comic.filePath }}</p>
          
          <div class="image-preview-section">
            <h3>內容預覽 & 自訂封面 <span class="loading" v-if="isLoadingImages">載入中...</span></h3>
            
            <div class="image-list">
              <div v-for="img in zipImages" :key="img" class="image-item glass-panel">
                <span class="img-name">{{ img }}</span>
                <button 
                  class="btn-primary cover-btn" 
                  :disabled="isSettingCover"
                  @click="handleSetCover(img)"
                >
                  設為封面
                </button>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  width: 90%;
  max-width: 1000px;
  height: 85vh;
  position: relative;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes slideUp {
  from { transform: translateY(30px) scale(0.98); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

.close-btn {
  position: absolute;
  top: 15px;
  right: 15px;
  background: transparent;
  color: #fff;
  font-size: 1.5rem;
  padding: 5px 10px;
  border-radius: 50%;
  z-index: 10;
}
.close-btn:hover {
  background: rgba(255,255,255,0.1);
  transform: rotate(90deg);
}

.modal-body {
  display: flex;
  height: 100%;
  padding: 30px;
  gap: 30px;
  overflow: hidden;
}

.modal-left {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.large-cover {
  width: 100%;
  max-height: 300px;
  object-fit: contain;
  border-radius: 8px;
  background: #000;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  flex-shrink: 0;
}

.tag-editor h3 {
  font-size: 1rem;
  margin-bottom: 10px;
  color: var(--accent-hover);
}

.current-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.edit-tag {
  background: var(--tag-bg);
  border: 1px solid var(--accent-color);
  color: #fff;
  padding: 4px 10px;
  border-radius: 15px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-tag .remove {
  cursor: pointer;
  color: var(--danger-color);
  font-weight: bold;
}
.edit-tag .remove:hover {
  filter: brightness(1.2);
}

.tag-input-wrapper {
  position: relative;
}

.tag-text-input {
  width: 100%;
  padding: 8px 10px;
  background: rgba(0,0,0,0.4);
  color: #fff;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  outline: none;
  font-size: 0.9rem;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.tag-text-input:focus {
  border-color: var(--accent-color);
}

.tag-suggestions {
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
  box-shadow: 0 8px 20px rgba(0,0,0,0.5);
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

.tag-suggestions li:hover {
  background: rgba(255,255,255,0.07);
  color: var(--text-primary);
}

.modal-right {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.title {
  font-size: 1.8rem;
  margin-bottom: 5px;
  line-height: 1.3;
}
.file-path {
  font-size: 0.8rem;
  color: var(--text-secondary);
  word-break: break-all;
  margin-bottom: 20px;
}

.image-preview-section {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.image-preview-section h3 {
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--panel-border);
}

.loading {
  font-size: 0.85rem;
  color: var(--accent-color);
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
}

.image-list {
  flex-grow: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 10px;
}

.image-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
}

.img-name {
  font-size: 0.9rem;
  word-break: break-all;
  margin-right: 15px;
}

.cover-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  font-size: 0.8rem;
}
</style>
