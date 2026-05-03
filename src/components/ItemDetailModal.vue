<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api, type Item, type Tag } from '../api';
import { useTagManager } from '../composables/useTagManager';
import { useToast } from '../composables/useToast';

const props = defineProps<{
  item: Item | null;
  allTags: Tag[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
}>();

const { show: showToast } = useToast();
const isVisible = computed(() => props.item !== null);
const isLoadingImages = ref(false);
const zipImages = ref<string[]>([]);
const isSettingCover = ref(false);
const coverUrl = ref('');
const zoomedCover = ref(false);

const { localTags, tagInput, suggestions: tagInputSuggestions, showSuggestions: showTagInputSuggestions,
    initTags, onInputChange: onTagInputChange, submitInput: submitTagInput,
    selectSuggestion: selectTagSuggestion, removeTagById: removeTag, hideSuggestions: hideTagSuggestions,
} = useTagManager({
    getEntityId: () => props.item?.id ?? null,
    addTag: (id, tagId) => api.tagItem(id, tagId),
    removeTag: (id, tagId) => api.untagItem(id, tagId),
    onUpdated: () => emit('updated'),
});

const availableTags = computed(() => {
    if (!props.allTags) return [];
    const currentTagIds = new Set(localTags.value.map((t: Tag) => t.id));
    return props.allTags.filter(t => !currentTagIds.has(t.id));
});

const loadCover = async () => {
    if (!props.item) { coverUrl.value = ''; return; }
    try {
        coverUrl.value = await api.getCoverBase64(props.item.id);
    } catch {
        coverUrl.value = '';
    }
};

const loadImages = async () => {
    if (!props.item) return;
    isLoadingImages.value = true;
    try {
        zipImages.value = await api.getItemImages(props.item.id);
    } catch {
        showToast('圖片載入失敗', 'error');
    } finally {
        isLoadingImages.value = false;
    }
};

const handleSetCover = async (imagePath: string) => {
    if (!props.item) return;
    isSettingCover.value = true;
    try {
        await api.setItemCover(props.item.id, imagePath);
        showToast('封面已更新', 'success');
        await loadCover();
        emit('updated');
    } catch {
        showToast('封面更新失敗', 'error');
    } finally {
        isSettingCover.value = false;
    }
};

watch(() => props.item, (item) => {
    initTags(item?.tags ?? []);
    zipImages.value = [];
    zoomedCover.value = false;
    if (item) {
        loadCover();
        loadImages();
    }
}, { immediate: true });
</script>

<template>
  <div class="modal-backdrop" v-if="isVisible" @click.self="emit('close')">
    <div class="modal-content glass-panel">
      <button class="close-btn" @click="emit('close')">✖</button>

      <transition name="zoom-fade">
        <div v-if="zoomedCover" class="cover-zoom-overlay" @click="zoomedCover = false">
          <img :src="coverUrl" class="cover-zoom-img" @click.stop />
          <button class="cover-zoom-close" @click="zoomedCover = false">✖</button>
        </div>
      </transition>

      <div v-if="item" class="modal-body">
        <div class="modal-left">
          <img :src="coverUrl" alt="Cover" class="large-cover" @click="zoomedCover = true" />

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
                placeholder="輸入標籤，用 、 或 ， 分隔後按 Enter..."
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
          <h2 class="title" :title="item.name">{{ item.name }}</h2>
          <p class="file-path">{{ item.path }}</p>

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
  background: var(--bg-scrim-heavy);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal-content {
  width: 90%;
  max-width: 1000px;
  height: 85vh;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes slideUp {
  from { transform: translateY(30px) scale(0.98); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}

.close-btn {
  position: absolute;
  top: 15px; right: 15px;
  background: transparent;
  color: var(--text-on-accent);
  font-size: 1.5rem;
  padding: 5px 10px;
  border-radius: 50%;
  z-index: 10;
}
.close-btn:hover { background: var(--bg-overlay-strong); transform: rotate(90deg); }

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
  background: var(--bg-image-placeholder);
  box-shadow: var(--shadow-modal);
  flex-shrink: 0;
  cursor: zoom-in;
  transition: opacity 0.15s;
}
.large-cover:hover { opacity: 0.85; }

.cover-zoom-overlay {
  position: absolute;
  inset: 24px;
  background: var(--bg-scrim-heavy);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  cursor: zoom-out;
}

.cover-zoom-img {
  max-width: 88%;
  max-height: 88%;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: var(--shadow-modal);
}

.cover-zoom-close {
  position: absolute;
  top: 12px; right: 12px;
  background: var(--bg-overlay-strong);
  border: none;
  color: var(--text-on-accent);
  font-size: 1rem;
  width: 32px; height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.cover-zoom-close:hover { background: var(--border-strong); }

.zoom-fade-enter-active, .zoom-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.zoom-fade-enter-from, .zoom-fade-leave-to {
  opacity: 0; transform: scale(0.95);
}

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

.modal-right {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.title { font-size: 1.8rem; margin-bottom: 5px; line-height: 1.3; }
.file-path { font-size: 0.8rem; color: var(--text-secondary); word-break: break-all; margin-bottom: 20px; }

.image-preview-section {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.image-preview-section h3 {
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-default);
}

.loading { font-size: 0.85rem; color: var(--accent); animation: pulse 1.5s infinite; }
@keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }

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

.img-name { font-size: 0.9rem; word-break: break-all; margin-right: 15px; }

.cover-btn { flex-shrink: 0; padding: 6px 12px; font-size: 0.8rem; }
</style>
