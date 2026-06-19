<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, type Item, type Tag } from '../api';
import { useTagManager } from '../composables/useTagManager';
import { useToast } from '../composables/useToast';
import DetailFormLayout from './DetailFormLayout.vue';
import MetadataLookupModal from './MetadataLookupModal.vue';
import TagEditorField from './TagEditorField.vue';

const props = defineProps<{
  item: Item | null;
  allTags: Tag[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
}>();

const { show: showToast } = useToast();
const isLoadingImages = ref(false);
const zipImages = ref<string[]>([]);
const isSettingCover = ref(false);
const coverUrl = ref('');
const zoomedCover = ref(false);
const showMetadataLookup = ref(false);

const { localTags, tagInput, suggestions: tagInputSuggestions, showSuggestions: showTagInputSuggestions,
    initTags, onInputChange: onTagInputChange, submitInput: submitTagInput,
    selectSuggestion: selectTagSuggestion, removeTagById: removeTag, hideSuggestions: hideTagSuggestions,
} = useTagManager({
    getEntityId: () => props.item?.id ?? null,
    addTag: (id, tagId) => api.tagItem(id, tagId),
    removeTag: (id, tagId) => api.untagItem(id, tagId),
    onUpdated: () => emit('updated'),
});

const loadCover = async () => {
    if (!props.item) { coverUrl.value = ''; return; }
    try {
        coverUrl.value = await api.getCoverBase64(props.item.id);
    } catch {
        coverUrl.value = '';
    }
};

const ARCHIVE_EXTS = ['zip', 'cbz'];
const isArchive = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    return ARCHIVE_EXTS.includes(ext);
};

const loadImages = async () => {
    if (!props.item) return;
    // 非壓縮包檔案沒有「內部影像清單」可列；跳過 API 呼叫避免無謂載入。
    if (!isArchive(props.item.path)) {
        zipImages.value = [];
        return;
    }
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

const handleMetadataApplied = () => {
    showMetadataLookup.value = false;
    emit('updated');
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
  <DetailFormLayout
    v-if="item"
    :title="item.name"
    :subtitle="item.path"
    @close="emit('close')"
  >
    <template #left>
      <img :src="coverUrl" alt="Cover" class="large-cover" @click="zoomedCover = true" />
      <TagEditorField
        :tags="localTags"
        v-model:tagInput="tagInput"
        :suggestions="tagInputSuggestions"
        :showSuggestions="showTagInputSuggestions"
        @remove="removeTag"
        @submit="submitTagInput"
        @selectSuggestion="selectTagSuggestion"
        @blur="hideTagSuggestions"
      />
    </template>

    <template #right>
      <div class="metadata-action-row">
        <button class="metadata-btn" type="button" @click="showMetadataLookup = true">
          Metadata 查詢 / tags
        </button>
      </div>

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
    </template>
  </DetailFormLayout>

  <!-- Zoom Overlay -->
  <transition name="zoom-fade">
    <div v-if="zoomedCover" class="cover-zoom-overlay" @click="zoomedCover = false">
      <img :src="coverUrl" class="cover-zoom-img" @click.stop />
      <button class="cover-zoom-close" @click="zoomedCover = false">✖</button>
    </div>
  </transition>

  <MetadataLookupModal
    :visible="showMetadataLookup"
    :item="item"
    @close="showMetadataLookup = false"
    @applied="handleMetadataApplied"
  />
</template>

<style scoped>
.large-cover {
  width: 100%;
  max-height: 300px;
  object-fit: contain;
  border-radius: var(--radius-md);
  background: var(--bg-image-placeholder);
  box-shadow: var(--shadow-modal);
  flex-shrink: 0;
  cursor: zoom-in;
  transition: opacity var(--transition-fast), border var(--transition-fast);
  border: 2px solid transparent;
}
.large-cover:hover { border-color: var(--accent); opacity: 1; }

.cover-zoom-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-scrim-heavy);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  cursor: zoom-out;
}

.cover-zoom-img {
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: var(--shadow-modal);
}

.cover-zoom-close {
  position: absolute;
  top: 20px; right: 20px;
  background: var(--bg-overlay-strong);
  border: none;
  color: var(--text-on-accent);
  font-size: 1.5rem;
  width: 40px; height: 40px;
  border-radius: 50%;
  cursor: pointer;
}

.zoom-fade-enter-active, .zoom-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.zoom-fade-enter-from, .zoom-fade-leave-to {
  opacity: 0; transform: scale(0.95);
}

.image-preview-section {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.image-preview-section h3 {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-default);
}

.loading { font-size: 0.85rem; color: var(--accent); animation: pulse 1.5s infinite; }
@keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }

.metadata-action-row {
  margin-bottom: 14px;
}

.metadata-btn {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--accent-border);
  background: var(--accent-bg-subtle);
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.metadata-btn:hover {
  background: var(--accent-bg-strong);
  border-color: var(--accent);
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

.img-name { font-size: 0.9rem; word-break: break-all; margin-right: 15px; }
.cover-btn { flex-shrink: 0; padding: 6px 12px; font-size: 0.8rem; }
</style>
