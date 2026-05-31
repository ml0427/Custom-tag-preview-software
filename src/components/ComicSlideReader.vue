<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { api, type FileItem, type Item } from '../api';
import { isReadableImageFile } from '../utils/readableItem';

type ReaderPage =
  | { kind: 'archive'; entry: string; label: string }
  | { kind: 'file'; path: string; label: string };

const props = defineProps<{
  item: Item | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const pages = ref<ReaderPage[]>([]);
const pageIndex = ref(0);
const imageUrl = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
const loadToken = ref(0);
const isAutoplaying = ref(false);
const autoplaySeconds = ref(3);
const readerShellRef = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);
const readerChromeVisible = ref(true);
let autoplayTimer: ReturnType<typeof window.setTimeout> | null = null;
let chromeHideTimer: ReturnType<typeof window.setTimeout> | null = null;

const currentPage = computed(() => pages.value[pageIndex.value] ?? null);
const isAtFirstPage = computed(() => pageIndex.value <= 0);
const isAtLastPage = computed(() => pageIndex.value >= pages.value.length - 1);
const canAutoplay = computed(() => pages.value.length > 1 && !isLoading.value && !errorMessage.value);
const pageLabel = computed(() =>
  pages.value.length > 0 ? `${pageIndex.value + 1} / ${pages.value.length}` : '0 / 0'
);
const readerModeLabel = computed(() => props.item?.itemType === 'folder' ? 'COMIC FOLDER' : 'ARCHIVE READER');
const autoplayLabel = computed(() => `${autoplaySeconds.value.toFixed(1)} 秒/頁`);
const autoplayButtonLabel = computed(() => isAutoplaying.value ? '停止播放' : '自動播放');
const canFullscreen = computed(() =>
  Boolean(document.fullscreenEnabled && readerShellRef.value?.requestFullscreen)
);
const fullscreenButtonLabel = computed(() => isFullscreen.value ? '退出全螢幕' : '全螢幕');
const footerHint = computed(() => {
  if (!currentPage.value) return 'Esc 關閉';
  if (isFullscreen.value && isAutoplaying.value) return `自動播放中 · ${autoplayLabel.value} · Esc 退出全螢幕`;
  if (isFullscreen.value) return 'Esc 退出全螢幕';
  if (isAutoplaying.value) return `自動播放中 · ${autoplayLabel.value} · Esc 關閉`;
  if (isAtLastPage.value) return '已到最後一頁 · Esc 關閉';
  return '點擊畫面或按空白鍵下一頁 · Esc 關閉';
});

const sortByName = (items: FileItem[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true }));

const waitForImageReady = async (url: string) => {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  if (image.decode) {
    await image.decode().catch(() => undefined);
    return;
  }
  if (image.complete) return;
  await new Promise<void>(resolve => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
  });
};

const clearAutoplayTimer = () => {
  if (!autoplayTimer) return;
  window.clearTimeout(autoplayTimer);
  autoplayTimer = null;
};

const clearChromeHideTimer = () => {
  if (!chromeHideTimer) return;
  window.clearTimeout(chromeHideTimer);
  chromeHideTimer = null;
};

const scheduleChromeHide = () => {
  clearChromeHideTimer();
  if (!isFullscreen.value) {
    readerChromeVisible.value = true;
    return;
  }
  chromeHideTimer = window.setTimeout(() => {
    readerChromeVisible.value = false;
    chromeHideTimer = null;
  }, 1800);
};

const showReaderChrome = () => {
  readerChromeVisible.value = true;
  scheduleChromeHide();
};

const holdReaderChrome = () => {
  readerChromeVisible.value = true;
  clearChromeHideTimer();
};

const scheduleAutoplay = () => {
  clearAutoplayTimer();
  if (!isAutoplaying.value || !props.item || !canAutoplay.value) return;
  if (isAtLastPage.value) {
    isAutoplaying.value = false;
    return;
  }

  autoplayTimer = window.setTimeout(() => {
    autoplayTimer = null;
    goNext();
  }, autoplaySeconds.value * 1000);
};

const stopAutoplay = () => {
  isAutoplaying.value = false;
  clearAutoplayTimer();
};

const toggleAutoplay = () => {
  if (!canAutoplay.value) return;
  if (isAutoplaying.value) {
    stopAutoplay();
    return;
  }
  isAutoplaying.value = true;
};

const syncFullscreenState = () => {
  isFullscreen.value = document.fullscreenElement === readerShellRef.value;
  showReaderChrome();
};

const enterFullscreen = async () => {
  if (!readerShellRef.value || !canFullscreen.value) return;
  try {
    await readerShellRef.value.requestFullscreen();
  } catch {
    // Fullscreen may be blocked by the host WebView; keep the reader usable.
  } finally {
    syncFullscreenState();
  }
};

const exitReaderFullscreen = async () => {
  if (!isFullscreen.value || !document.exitFullscreen) return;
  try {
    await document.exitFullscreen();
  } catch {
    // If the host already exited fullscreen, just resync local state.
  } finally {
    syncFullscreenState();
  }
};

const toggleFullscreen = async () => {
  if (isFullscreen.value) {
    await exitReaderFullscreen();
    return;
  }
  await enterFullscreen();
};

const closeReader = async () => {
  stopAutoplay();
  await exitReaderFullscreen();
  emit('close');
};

const loadCurrentPage = async () => {
  const item = props.item;
  const page = currentPage.value;
  const token = ++loadToken.value;
  errorMessage.value = '';

  if (!item || !page) return;

  isLoading.value = true;
  try {
    const url = page.kind === 'archive'
      ? await api.getArchiveImageBase64ByPath(item.path, page.entry)
      : await api.getImageBase64ByPath(page.path);
    await waitForImageReady(url);
    if (loadToken.value === token) imageUrl.value = url;
  } catch (e: any) {
    if (loadToken.value === token) {
      errorMessage.value = e?.message ?? String(e);
      stopAutoplay();
    }
  } finally {
    if (loadToken.value === token) isLoading.value = false;
  }
};

const loadPages = async () => {
  const item = props.item;
  const token = ++loadToken.value;
  pages.value = [];
  pageIndex.value = 0;
  imageUrl.value = '';
  errorMessage.value = '';

  if (!item) return;

  isLoading.value = true;
  try {
    if (item.itemType === 'folder') {
      const files = await api.listDirFiles(item.path);
      pages.value = sortByName(files)
        .filter(isReadableImageFile)
        .map(file => ({ kind: 'file', path: file.path, label: file.name }));
    } else {
      const entries = await api.getArchiveImagesByPath(item.path);
      pages.value = entries.map(entry => ({
        kind: 'archive',
        entry,
        label: entry.split(/[\\/]/).pop() ?? entry,
      }));
    }

    if (loadToken.value !== token) return;
    if (pages.value.length === 0) {
      errorMessage.value = '沒有可閱讀的圖片頁面';
      stopAutoplay();
      return;
    }
    await loadCurrentPage();
  } catch (e: any) {
    if (loadToken.value === token) {
      errorMessage.value = e?.message ?? String(e);
      stopAutoplay();
    }
  } finally {
    if (loadToken.value === token) isLoading.value = false;
  }
};

const goPrev = () => {
  if (isAtFirstPage.value) return;
  pageIndex.value -= 1;
  loadCurrentPage();
};

const goNext = () => {
  if (isAtLastPage.value) return;
  pageIndex.value += 1;
  loadCurrentPage();
};

const onKeydown = (event: KeyboardEvent) => {
  if (!props.item) return;
  if (event.key === 'Escape') {
    if (!isFullscreen.value) void closeReader();
    return;
  }
  if (event.key === 'ArrowLeft') goPrev();
  if (event.key === 'ArrowRight' || event.key === ' ') {
    event.preventDefault();
    goNext();
  }
  if (event.key === 'Home') {
    event.preventDefault();
    pageIndex.value = 0;
    loadCurrentPage();
  }
  if (event.key === 'End' && pages.value.length > 0) {
    event.preventDefault();
    pageIndex.value = pages.value.length - 1;
    loadCurrentPage();
  }
};

watch(() => props.item, item => {
  stopAutoplay();
  loadPages();
  window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('fullscreenchange', syncFullscreenState);
  if (item) {
    window.addEventListener('keydown', onKeydown);
    document.addEventListener('fullscreenchange', syncFullscreenState);
  }
}, { immediate: true });
watch([isAutoplaying, autoplaySeconds, pageIndex, canAutoplay], scheduleAutoplay);
watch(isFullscreen, fullscreen => {
  if (fullscreen) {
    showReaderChrome();
    return;
  }
  clearChromeHideTimer();
  readerChromeVisible.value = true;
});

onUnmounted(() => {
  clearAutoplayTimer();
  clearChromeHideTimer();
  window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('fullscreenchange', syncFullscreenState);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="item"
      ref="readerShellRef"
      class="reader-shell"
      :class="{ 'is-fullscreen': isFullscreen, 'reader-chrome-visible': readerChromeVisible }"
      @mousemove="showReaderChrome"
    >
      <div class="reader-chrome-zone reader-chrome-zone-top" @mouseenter="showReaderChrome"></div>
      <div class="reader-chrome-zone reader-chrome-zone-bottom" @mouseenter="showReaderChrome"></div>
      <div class="reader-topbar" @click.stop @mouseenter="holdReaderChrome" @mouseleave="scheduleChromeHide">
        <div class="reader-title">
          <span class="reader-kicker">{{ readerModeLabel }}</span>
          <strong>{{ item.name }}</strong>
        </div>
        <div class="reader-actions">
          <span class="reader-count">{{ pageLabel }}</span>
          <div class="autoplay-control" @click.stop @dblclick.stop>
            <button
              class="reader-btn autoplay-toggle"
              type="button"
              :disabled="!canAutoplay"
              :aria-pressed="isAutoplaying"
              @click.stop="toggleAutoplay"
            >
              {{ autoplayButtonLabel }}
            </button>
            <label class="speed-control">
              <span class="speed-label">{{ autoplayLabel }}</span>
              <input
                v-model.number="autoplaySeconds"
                class="speed-slider"
                type="range"
                min="1"
                max="10"
                step="0.5"
                :disabled="!canAutoplay"
                aria-label="自動播放速度"
              />
            </label>
          </div>
          <button class="reader-btn" type="button" :disabled="isAtFirstPage" @click.stop="goPrev">上一頁</button>
          <button class="reader-btn" type="button" :disabled="isAtLastPage" @click.stop="goNext">下一頁</button>
          <button
            class="reader-btn fullscreen-toggle"
            type="button"
            :disabled="!canFullscreen"
            :aria-pressed="isFullscreen"
            @click.stop="toggleFullscreen"
          >
            {{ fullscreenButtonLabel }}
          </button>
          <button class="reader-close" type="button" title="關閉" @click.stop="closeReader">✕</button>
        </div>
      </div>

      <main class="reader-stage" @click="goNext">
        <div v-if="isLoading && !imageUrl" class="reader-state">載入中...</div>
        <div v-else-if="errorMessage" class="reader-state reader-error">{{ errorMessage }}</div>
        <img v-else-if="imageUrl" class="reader-image" :src="imageUrl" :alt="currentPage?.label ?? item.name" />
      </main>

      <div class="reader-bottombar" @click.stop @mouseenter="holdReaderChrome" @mouseleave="scheduleChromeHide">
        <span>{{ currentPage?.label ?? '' }}</span>
        <span class="reader-hint">{{ footerHint }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.reader-shell {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: #08090b;
  color: #f4f1ea;
}

.reader-shell.is-fullscreen {
  display: block;
}

.reader-topbar,
.reader-bottombar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 16px;
  background: rgba(8, 9, 11, 0.92);
  border-color: rgba(255, 255, 255, 0.12);
}

.is-fullscreen .reader-topbar,
.is-fullscreen .reader-bottombar {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 3;
  background: rgba(8, 9, 11, 0.78);
  backdrop-filter: blur(14px);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    background 0.18s ease;
}

.is-fullscreen .reader-topbar {
  top: 0;
  transform: translateY(-100%);
}

.is-fullscreen .reader-bottombar {
  bottom: 0;
  transform: translateY(100%);
}

.is-fullscreen:not(.reader-chrome-visible) .reader-topbar,
.is-fullscreen:not(.reader-chrome-visible) .reader-bottombar {
  opacity: 0;
  pointer-events: none;
}

.is-fullscreen.reader-chrome-visible .reader-topbar,
.is-fullscreen.reader-chrome-visible .reader-bottombar {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.reader-chrome-zone {
  display: none;
}

.is-fullscreen .reader-chrome-zone {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 2;
  display: block;
  height: 72px;
}

.reader-chrome-zone-top { top: 0; }
.reader-chrome-zone-bottom { bottom: 0; }

.reader-topbar { border-bottom: 1px solid rgba(255, 255, 255, 0.12); }
.reader-bottombar {
  min-height: 38px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(244, 241, 234, 0.68);
  font-size: 0.8rem;
}

.reader-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.reader-title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-kicker,
.reader-count {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0;
  color: rgba(244, 241, 234, 0.6);
}

.reader-hint {
  min-width: 0;
  color: rgba(244, 241, 234, 0.48);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}

.autoplay-control {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.autoplay-toggle[aria-pressed="true"] {
  background: rgba(255, 188, 82, 0.18);
  border-color: rgba(255, 188, 82, 0.5);
  color: #ffd89b;
}

.fullscreen-toggle[aria-pressed="true"] {
  background: rgba(116, 198, 255, 0.16);
  border-color: rgba(116, 198, 255, 0.46);
  color: #b9e4ff;
}

.speed-control {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: rgba(244, 241, 234, 0.64);
  font-size: 0.75rem;
}

.speed-label {
  min-width: 48px;
  text-align: right;
  font-family: var(--font-mono);
}

.speed-slider {
  width: 148px;
  min-width: 0;
  height: 24px;
  background: transparent;
  cursor: pointer;
  appearance: none;
}

.speed-slider:disabled {
  opacity: 0.42;
  cursor: default;
}

.speed-slider::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(244, 241, 234, 0.3), rgba(255, 208, 137, 0.9));
}

.speed-slider::-webkit-slider-thumb {
  width: 20px;
  height: 20px;
  margin-top: -8px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 6px;
  background:
    linear-gradient(90deg, transparent 6px, #08090b 6px 8px, transparent 8px 12px, #08090b 12px 14px, transparent 14px),
    #ffd089;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  appearance: none;
}

.speed-slider::-moz-range-track {
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(244, 241, 234, 0.3), rgba(255, 208, 137, 0.9));
}

.speed-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 6px;
  background:
    linear-gradient(90deg, transparent 6px, #08090b 6px 8px, transparent 8px 12px, #08090b 12px 14px, transparent 14px),
    #ffd089;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}

.reader-btn,
.reader-close {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #f4f1ea;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.reader-btn {
  padding: 6px 10px;
  font-size: 0.82rem;
}

.reader-close {
  width: 30px;
  height: 30px;
  line-height: 1;
}

.reader-btn:hover:not(:disabled),
.reader-close:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.32);
}

.reader-btn:disabled {
  opacity: 0.38;
  cursor: default;
}

.reader-stage {
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  overflow: hidden;
  cursor: pointer;
}

.is-fullscreen .reader-stage {
  width: 100%;
  height: 100%;
  padding: 0;
}

.reader-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
}

.reader-state {
  color: rgba(244, 241, 234, 0.72);
  font-size: 0.95rem;
}

.reader-error {
  color: #ffb4a8;
}
</style>
