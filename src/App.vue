<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { api, type Item, type Folder, type Tag } from './api'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useItemTypes } from './composables/useItemTypes'
import ActivityBar from './components/ActivityBar.vue'
import TagSidebar from './components/TagSidebar.vue'
import SourcePanel from './components/SourcePanel.vue'
import ItemGallery from './components/ItemGallery.vue'
import ItemDetailModal from './components/ItemDetailModal.vue'
import FolderDetailModal from './components/FolderDetailModal.vue'
import DuplicateView from './components/DuplicateView.vue'
import ToastContainer from './components/ToastContainer.vue'

const activePanel = ref<string | null>('workspace')
const selectedTagIds = ref<number[]>([])
const selectedSourcePath = ref<string | null>(null)
const selectedFileItem = ref<Item | null>(null)
const selectedFolderItem = ref<Item | null>(null)
const allTags = ref<Tag[]>([])
const galleryRef = ref<InstanceType<typeof ItemGallery> | null>(null)

const handleActivitySelect = (id: string) => {
  if (id === 'workspace' && activePanel.value !== 'workspace') {
    selectedTagIds.value = []
  }
  activePanel.value = activePanel.value === id ? null : id
}

const handleTagSelect = (tagIds: number[]) => {
  selectedTagIds.value = tagIds
}

const handleJumpToTag = (tagId: number) => {
  selectedTagIds.value = [tagId]
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

const { load: loadItemTypes } = useItemTypes()

// ── Scan progress bar ─────────────────────────────────────────────────────────
const scanProgress = ref<{ active: boolean; current: number; name: string }>({
  active: false, current: 0, name: ''
})
let scanHideTimer: ReturnType<typeof setTimeout> | null = null
let unlistenScan: UnlistenFn | null = null

const resetScanHideTimer = () => {
  if (scanHideTimer) clearTimeout(scanHideTimer)
  scanHideTimer = setTimeout(() => { scanProgress.value.active = false }, 1500)
}

onMounted(async () => {
  loadGlobalTags()
  loadItemTypes()
  unlistenScan = await listen<{ current: number; name: string }>('scan-progress', ({ payload }) => {
    scanProgress.value = { active: true, current: payload.current, name: payload.name }
    resetScanHideTimer()
  })
})

onUnmounted(() => {
  unlistenScan?.()
  if (scanHideTimer) clearTimeout(scanHideTimer)
})
</script>

<template>
  <div class="layout">
    <ActivityBar :active="activePanel" :hasSource="allTags.length > 0" @select="handleActivitySelect" />

    <transition name="panel-slide">
      <div v-if="activePanel && activePanel !== 'duplicates'" class="side-panel glass-panel">
        <TagSidebar
          v-if="activePanel === 'tags'"
          :selectedTagIds="selectedTagIds"
          @select="handleTagSelect"
        />
        <SourcePanel
          v-else-if="activePanel === 'workspace'"
          :selectedPath="selectedSourcePath"
          @select="(path) => { selectedSourcePath = path; }"
          @folderCreated="galleryRef?.refresh()"

        />
      </div>
    </transition>

    <main class="main-content">
      <DuplicateView v-if="activePanel === 'duplicates'" />
      <ItemGallery
        v-else
        ref="galleryRef"
        :sourcePath="selectedSourcePath"
        :selectedTagIds="selectedTagIds"
        @showDetail="handleFileItemSelect"
        @showFolderDetail="handleFolderItemSelect"
        @navigateDir="(path) => { selectedSourcePath = path; }"
        @jumpToTag="handleJumpToTag"
      />
    </main>

    <ItemDetailModal
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

    <ToastContainer />

    <!-- 掃描進度條 -->
    <Teleport to="body">
      <transition name="scan-bar">
        <div v-if="scanProgress.active" class="scan-progress-bar">
          <span class="scan-spinner"></span>
          <span class="scan-text">掃描中… {{ scanProgress.current }} 個項目</span>
          <span class="scan-name">{{ scanProgress.name }}</span>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-app);
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

.scan-progress-bar {
  position: fixed;
  bottom: 20px;
  right: 24px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: var(--shadow-popover);
  z-index: 1200;
  max-width: 360px;
}

.scan-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-default);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.scan-text {
  font-size: 0.82rem;
  color: var(--text-primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.scan-name {
  font-size: 0.78rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scan-bar-enter-active, .scan-bar-leave-active { transition: opacity 0.2s, transform 0.2s; }
.scan-bar-enter-from, .scan-bar-leave-to { opacity: 0; transform: translateY(10px); }
</style>
