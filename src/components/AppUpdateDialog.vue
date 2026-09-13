<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useAppUpdater } from '../composables/useAppUpdater'

const {
  dialogVisible, availableVersion, releaseNotes, status, statusText,
  errorMessage, installing, progress, installUpdate, dismissUpdate,
} = useAppUpdater()
const dialog = ref<HTMLDialogElement | null>(null)

watch(dialogVisible, async visible => {
  await nextTick()
  if (visible) dialog.value?.showModal()
  else dialog.value?.close()
})
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="update-dialog" aria-labelledby="update-title" @cancel.prevent="dismissUpdate">
      <h2 id="update-title">{{ installing ? '正在更新程式' : `更新至 v${availableVersion}` }}</h2>
      <p>更新會關閉程式，安裝完成後自動重新開啟。請先完成正在進行的整理或掃描。</p>
      <details v-if="releaseNotes" class="release-notes">
        <summary>查看更新內容</summary>
        <pre>{{ releaseNotes }}</pre>
      </details>
      <p role="status" aria-live="polite">{{ statusText }}</p>
      <progress v-if="status === 'downloading'" :value="progress" max="100" aria-label="更新下載進度"></progress>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <div class="update-actions">
        <button type="button" :disabled="installing" autofocus @click="dismissUpdate">稍後再說</button>
        <button type="button" class="update-primary" :disabled="installing" @click="installUpdate">
          {{ status === 'restart-required' ? '重新開啟' : status === 'error' ? '重試更新' : '更新並重新開啟' }}
        </button>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.update-dialog {
  margin: auto;
  width: min(480px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  padding: 24px;
  border: 1px solid var(--line-default);
  border-radius: 16px;
  background: var(--surface-panel);
  color: var(--text-primary);
  overflow: auto;
}

.update-dialog::backdrop {
  background: var(--bg-scrim);
}

h2 { margin: 0 0 16px; font-size: 20px; }
p { margin-top: 12px; line-height: 1.6; }
.release-notes { margin: 16px 0; }
summary { cursor: pointer; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; max-height: 220px; overflow: auto; }
progress { width: 100%; accent-color: var(--accent); }
.update-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-top: 24px; }
button {
  padding: 10px 16px;
  border: 1px solid var(--line-default);
  border-radius: 8px;
  background: var(--surface-panel);
  color: var(--text-primary);
  cursor: pointer;
}
button:disabled { opacity: 0.6; cursor: wait; }
.update-primary { background: var(--accent); color: var(--text-on-accent); }
</style>
