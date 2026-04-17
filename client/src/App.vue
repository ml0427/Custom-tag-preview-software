<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, type Comic, type Tag } from './api'
import TagSidebar from './components/TagSidebar.vue'
import ComicGallery from './components/ComicGallery.vue'
import ComicDetailModal from './components/ComicDetailModal.vue'

const selectedTagId = ref<number | null>(null)
const selectedComic = ref<Comic | null>(null)
const allTags = ref<Tag[]>([])
const galleryRef = ref<InstanceType<typeof ComicGallery> | null>(null)

const handleTagSelect = (tagId: number | null) => {
  selectedTagId.value = tagId
}

const handleComicSelect = (comic: Comic) => {
  selectedComic.value = comic
}

const handleModalClose = () => {
  selectedComic.value = null
}

const handleComicUpdated = async () => {
  // If tags changed, we might need to refresh comic info from API
  if (selectedComic.value) {
    try {
      selectedComic.value = await api.getComic(selectedComic.value.id)
    } catch(e) { /* ignore */ }
  }
  // Also refresh gallery list and tags
  galleryRef.value?.refresh()
  loadGlobalTags()
}

const loadGlobalTags = async () => {
  allTags.value = await api.getTags()
}

onMounted(() => {
  loadGlobalTags()
})
</script>

<template>
  <div class="layout">
    <TagSidebar 
      :selectedTagId="selectedTagId" 
      @select="handleTagSelect" 
    />
    
    <main class="main-content">
      <ComicGallery 
        ref="galleryRef"
        :selectedTagId="selectedTagId"
        @showDetail="handleComicSelect"
      />
    </main>

    <ComicDetailModal 
      :comic="selectedComic"
      :allTags="allTags"
      @close="handleModalClose"
      @updated="handleComicUpdated"
    />
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-image: radial-gradient(circle at top right, #1a2333 0%, #0d1117 100%);
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
