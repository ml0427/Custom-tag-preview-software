<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { api, type Comic, type Page } from '../api';
import ComicCard from './ComicCard.vue';

const props = defineProps<{
  selectedTagId: number | null
}>();

const emit = defineEmits<{
  (e: 'showDetail', comic: Comic): void
}>();

const comicsPage = ref<Page<Comic> | null>(null);
const isLoading = ref(false);
const currentPage = ref(0);

const loadComics = async (page: number) => {
    isLoading.value = true;
    try {
        comicsPage.value = await api.getComics(page, 20, props.selectedTagId ?? undefined);
        currentPage.value = page;
    } catch (e) {
        console.error(e);
    } finally {
        isLoading.value = false;
    }
};

watch(() => props.selectedTagId, () => {
    // Reset to page 0 when tag changes
    loadComics(0);
});

onMounted(() => {
    loadComics(0);
});

const handlePrev = () => {
    if (currentPage.value > 0) loadComics(currentPage.value - 1);
};

const handleNext = () => {
    if (comicsPage.value && currentPage.value < comicsPage.value.totalPages - 1) {
        loadComics(currentPage.value + 1);
    }
};

// Expose refresh method so App can call it when modal updates
defineExpose({
    refresh: () => loadComics(currentPage.value)
});
</script>

<template>
  <div class="gallery-container">
    <div class="header">
      <h2>📚 收藏庫</h2>
      <div v-if="comicsPage" class="pagination">
        <button class="btn-primary" @click="handlePrev" :disabled="currentPage === 0 || isLoading">◀</button>
        <span>第 {{ currentPage + 1 }} / {{ comicsPage.totalPages || 1 }} 頁</span>
        <button class="btn-primary" @click="handleNext" :disabled="!comicsPage || currentPage >= comicsPage.totalPages - 1 || isLoading">▶</button>
      </div>
    </div>
    
    <div v-if="isLoading" class="loader">
      <div class="spinner"></div>
      <p>載入中...</p>
    </div>
    
    <div v-else-if="comicsPage?.content.length === 0" class="empty-state">
      <h3>沒有找到相關漫畫記錄 🥺</h3>
      <p>請嘗試切換標籤，或點擊左下角掃描本機資料夾。</p>
    </div>
    
    <div v-else class="grid">
      <ComicCard 
        v-for="comic in comicsPage?.content" 
        :key="comic.id" 
        :comic="comic" 
        @click="emit('showDetail', comic)"
      />
    </div>
  </div>
</template>

<style scoped>
.gallery-container {
  flex-grow: 1;
  padding: 20px;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 10px 20px;
  background: var(--panel-bg);
  backdrop-filter: var(--glass-blur);
  border-radius: 12px;
  border: 1px solid var(--panel-border);
}

.pagination {
  display: flex;
  align-items: center;
  gap: 15px;
  font-weight: bold;
}
.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 25px;
  overflow-y: auto;
  padding: 10px;
  padding-bottom: 40px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  text-align: center;
}
.empty-state h3 {
  font-size: 1.5rem;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255,255,255,0.1);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 15px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
