<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, type Item, type Folder, type Tag } from './api'
import ActivityBar from './components/ActivityBar.vue'
import TagSidebar from './components/TagSidebar.vue'
import WorkspacePanel from './components/WorkspacePanel.vue'
import ComicGallery from './components/ComicGallery.vue'
import ComicDetailModal from './components/ComicDetailModal.vue'
import FolderDetailModal from './components/FolderDetailModal.vue'
import ScanWizardModal from './components/ScanWizardModal.vue'

const activePanel = ref<string | null>('workspace')
const selectedTagId = ref<number | null>(null)
const selectedSourcePath = ref<string | null>(null)
const selectedFileItem = ref<Item | null>(null)
const selectedFolderItem = ref<Item | null>(null)
const allTags = ref<Tag[]>([])
const galleryRef = ref<InstanceType<typeof ComicGallery> | null>(null)
const showScanWizard = ref(false)

const handleActivitySelect = (id: string) => {
  if (id === 'workspace' && activePanel.value !== 'workspace') {
    selectedTagId.value = null
  }
  if (id === 'tags' && activePanel.value !== 'tags') {
    selectedSourcePath.value = null
  }
  activePanel.value = activePanel.value === id ? null : id
}

const handleTagSelect = (tagId: number | null) => {
  selectedTagId.value = tagId
}

const handleJumpToTag = (tagId: number) => {
  selectedTagId.value = tagId
  activePanel.value = 'tags'
}

const handleFileItemSelect = (item: Item) => {
  selectedFileItem.value = item
}

const handleFolderItemSelect = (item: Item) => {
  selectedFolderItem.value = item
}

const handleModalClose = () => {
  selectedFileItem.value = null
}

const handleFileItemUpdated = async () => {
  if (selectedFileItem.value) {
    try {
      selectedFileItem.value = await api.getItem(selectedFileItem.value.id)
    } catch { /* ignore */ }
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
          @folderCreated="galleryRef?.refresh()"
          @openScanWizard="showScanWizard = true"
        />
      </div>
    </transition>

    <main class="main-content">
      <ComicGallery
        ref="galleryRef"
        :sourcePath="selectedSourcePath"
        :selectedTagId="selectedTagId"
        @showDetail="handleFileItemSelect"
        @showFolderDetail="handleFolderItemSelect"
        @navigateDir="(path) => { selectedSourcePath = path; }"
        @jumpToTag="handleJumpToTag"
      />
    </main>

    <ComicDetailModal
      :item="selectedFileItem"
      :allTags="allTags"
      @close="handleModalClose"
      @updated="handleFileItemUpdated"
    />

    <FolderDetailModal
      :item="selectedFolderItem"
      :allTags="allTags"
      @close="selectedFolderItem = null"
      @updated="galleryRef?.refresh()"
      @deleted="galleryRef?.refresh()"
    />

    <ScanWizardModal
      :visible="showScanWizard"
      @close="showScanWizard = false"
      @completed="galleryRef?.refresh(); loadGlobalTags()"
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
