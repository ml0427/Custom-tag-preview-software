<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { type Comic, api } from '../api';

const props = defineProps<{
  comic: Comic
}>();

const emit = defineEmits<{
  (e: 'click', comic: Comic): void
}>();

// 使用 ref + 異步載入，避免自定義協議相容性問題
const coverUrl = ref('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100%\' height=\'100%\' fill=\'%23222\'/></svg>');

const loadCover = async () => {
    try {
        coverUrl.value = await api.getCoverBase64(props.comic.id);
    } catch {
        // 使用預設灰色佔位
    }
};

onMounted(loadCover);
watch(() => props.comic.id, loadCover);

const formattedDate = computed(() => {
    return new Date(props.comic.importTime).toLocaleDateString();
});
</script>

<template>
  <div class="comic-card glass-panel" @click="emit('click', comic)">
    <div class="cover-wrapper">
      <img :src="coverUrl" alt="Comic Cover" class="cover-img" loading="lazy" @error="(e) => (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100%\' height=\'100%\' fill=\'%23222\'/></svg>'" />
      <div class="tag-overlay">
        <span v-for="tag in comic.tags.slice(0, 3)" :key="tag.id" class="mini-tag">
          {{ tag.name }}
        </span>
        <span v-if="comic.tags.length > 3" class="mini-tag">...</span>
      </div>
    </div>
    <div class="comic-info">
      <h3 class="title" :title="comic.title">{{ comic.title }}</h3>
      <div class="meta">
        <span class="date">{{ formattedDate }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comic-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  height: 100%;
}

.comic-card:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.5), 0 0 15px rgba(47, 129, 247, 0.2);
  border-color: rgba(47, 129, 247, 0.5);
}

.cover-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  background: #111;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.6s ease;
}

.comic-card:hover .cover-img {
  transform: scale(1.08);
}

.tag-overlay {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.mini-tag {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.2);
}

.comic-info {
  padding: 12px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.title {
  font-size: 0.95rem;
  font-weight: 500;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: var(--text-secondary);
}
</style>
