<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, type Comic, type Tag } from './api'
import ActivityBar from './components/ActivityBar.vue'
import TagSidebar from './components/TagSidebar.vue'
import WorkspacePanel from './components/WorkspacePanel.vue'
import ComicGallery from './components/ComicGallery.vue'
import ComicDetailModal from './components/ComicDetailModal.vue'

const activePanel = ref<string | null>('workspace')
const selectedTagId = ref<number | null>(null)
const selectedSourcePath = ref<string | null>(null)
const selectedComic = ref<Comic | null>(null)
const allTags = ref<Tag[]>([])
const galleryRef = ref<InstanceType<typeof ComicGallery> | null>(null)

const handleActivitySelect = (id: string) => {
  activePanel.value = activePanel.value === id ? null : id
}

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
  if (selectedComic.value) {
    try {
      selectedComic.value = await api.getComic(selectedComic.value.id)
    } catch(e) { /* ignore */ }
  }
  galleryRef.value?.refresh()
  loadGlobalTags()
}

const loadGlobalTags = async () => {
  allTags.value = await api.getTags()
}

onMounted(() => loadGlobalTags())
</script>

<template>
  <div class="layout">
    <ActivityBar :active="activePanel" :hasSource="selectedSourcePath !== null" @select="handleActivitySelect" />

    <transition name="panel-slide">
      <div v-if="activePanel" class="side-panel glass-panel">
        <TagSidebar
          v-if="activePanel === 'tags'"
          :selectedTagId="selectedTagId"
          @select="handleTagSelect"
        />
        <WorkspacePanel
          v-else-if="activePanel === 'workspace'"
          :selectedPath="selectedSourcePath"
          @select="(path) => { selectedSourcePath = path; }"
        />
      </div>
    </transition>

    <main class="main-content">
      <ComicGallery
        ref="galleryRef"
        :selectedTagId="selectedTagId"
        :sourcePath="selectedSourcePath"
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

.side-panel {
  width: 240px;
  height: 100vh;
  flex-shrink: 0;
  border-radius: 0;
  border-top: none;
  border-bottom: none;
  border-left: none;
  overflow: hidden;
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: width 0.25s ease, opacity 0.2s ease;
  overflow: hidden;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  width: 0;
  opacity: 0;
}

.panel-slide-enter-to,
.panel-slide-leave-from {
  width: 240px;
  opacity: 1;
}
</style>
