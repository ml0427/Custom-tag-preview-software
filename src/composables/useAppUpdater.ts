import { computed, readonly, ref, shallowRef } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'current' | 'downloading' |
  'installing' | 'restarting' | 'restart-required' | 'error' | 'unsupported'

const AUTO_CHECK_KEY = 'app-update-auto-check'
const DISMISSED_KEY = 'app-update-dismissed-version'
const status = ref<UpdateStatus>('idle')
const currentVersion = ref('')
const update = shallowRef<Update | null>(null)
const dialogVisible = ref(false)
const errorMessage = ref('')
const downloadedBytes = ref(0)
const totalBytes = ref<number | undefined>()
const autoCheck = ref(true)
let initialized = false

function readPreference(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch {
    errorMessage.value = '無法儲存更新偏好；這次選擇仍會在本次開啟期間生效。'
  }
}

const busy = computed(() => ['checking', 'downloading', 'installing', 'restarting'].includes(status.value))
const installing = computed(() => ['downloading', 'installing', 'restarting'].includes(status.value))
const progress = computed(() => totalBytes.value
  ? Math.min(100, Math.round(downloadedBytes.value / totalBytes.value * 100))
  : undefined)
const statusText = computed(() => {
  switch (status.value) {
    case 'checking': return '正在檢查更新…'
    case 'available': return `有新版本 v${update.value?.version}`
    case 'current': return '目前已是最新版本'
    case 'downloading': return progress.value === undefined ? '正在下載更新…' : `正在下載更新… ${progress.value}%`
    case 'installing': return '正在驗證並安裝更新…'
    case 'restarting': return '正在重新開啟程式…'
    case 'restart-required': return '更新已安裝，請重新開啟程式'
    case 'error': return '更新未完成'
    case 'unsupported': return '請使用正式桌面安裝版檢查更新'
    default: return '啟動時自動檢查，確認後下載並安裝'
  }
})

async function initialize() {
  if (initialized) return
  initialized = true
  autoCheck.value = readPreference(AUTO_CHECK_KEY) !== 'false'
  if (!isTauri() || import.meta.env.DEV) {
    status.value = 'unsupported'
    return
  }
  try { currentVersion.value = await getVersion() } catch {
    // The native updater still compares the actual package version itself.
    currentVersion.value = ''
  }
}

async function closePreviousUpdate() {
  const previous = update.value
  update.value = null
  try { await previous?.close() } catch (error) {
    console.debug('釋放更新資訊失敗', error)
  }
}

async function checkForUpdates(manual = true) {
  await initialize()
  if (busy.value || status.value === 'unsupported' || status.value === 'restart-required') return
  if (!manual && !autoCheck.value) return
  status.value = 'checking'
  errorMessage.value = ''
  await closePreviousUpdate()
  try {
    update.value = await check({ timeout: 15000 })
    status.value = update.value ? 'available' : 'current'
    if (update.value && (manual || readPreference(DISMISSED_KEY) !== update.value.version)) {
      dialogVisible.value = true
    }
  } catch (error) {
    status.value = 'error'
    errorMessage.value = '無法取得更新資訊。請確認網路連線後重試；若尚未發佈第一個正式版本，更新來源也會暫時無法使用。'
    console.debug('檢查更新失敗', error)
  }
}

function onDownloadEvent(event: DownloadEvent) {
  if (event.event === 'Started') {
    downloadedBytes.value = 0
    totalBytes.value = event.data.contentLength
  } else if (event.event === 'Progress') {
    downloadedBytes.value += event.data.chunkLength
  } else {
    status.value = 'installing'
  }
}

async function restartApp() {
  status.value = 'restarting'
  errorMessage.value = ''
  try { await relaunch() } catch (error) {
    status.value = 'restart-required'
    errorMessage.value = '更新已安裝，但無法自動重新開啟。請關閉程式後再開啟，或按下重新開啟重試。'
    console.debug('更新後重新開啟失敗', error)
  }
}

async function installUpdate() {
  if (busy.value || !isTauri() || import.meta.env.DEV) return
  if (status.value === 'restart-required') {
    await restartApp()
    return
  }
  if (!update.value) return
  status.value = 'downloading'
  dialogVisible.value = true
  errorMessage.value = ''
  downloadedBytes.value = 0
  totalBytes.value = undefined
  try {
    // The native plugin verifies the signature before launching the installer.
    // Windows exits here; its installer handles restarting the application.
    await update.value.downloadAndInstall(onDownloadEvent, { timeout: 300000 })
  } catch (error) {
    status.value = 'error'
    errorMessage.value = '更新下載或驗證、安裝失敗，尚未完成更新。請確認網路與安裝權限後重試。'
    console.debug('安裝更新失敗', error)
    return
  }
  await restartApp()
}

function dismissUpdate() {
  if (installing.value) return
  dialogVisible.value = false
  if (update.value) savePreference(DISMISSED_KEY, update.value.version)
}

function setAutoCheck(enabled: boolean) {
  autoCheck.value = enabled
  savePreference(AUTO_CHECK_KEY, String(enabled))
}

export function useAppUpdater() {
  return {
    status: readonly(status), currentVersion: readonly(currentVersion),
    availableVersion: computed(() => update.value?.version ?? ''),
    releaseNotes: computed(() => update.value?.body ?? ''),
    dialogVisible: readonly(dialogVisible), errorMessage: readonly(errorMessage),
    autoCheck: readonly(autoCheck), busy, installing, progress, statusText,
    initialize, checkForUpdates, installUpdate, dismissUpdate, setAutoCheck,
    showUpdate: () => { dialogVisible.value = true },
  }
}
