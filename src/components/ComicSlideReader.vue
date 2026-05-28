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

const currentPage = computed(() => pages.value[pageIndex.value] ?? null);
const pageLabel = computed(() =>
  pages.value.length > 0 ? `${pageIndex.value + 1} / ${pages.value.length}` : '0 / 0'
);

const sortByName = (items: FileItem[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true }));

const loadCurrentPage = async () => {
  const item = props.item;
  const page = currentPage.value;
  const token = ++loadToken.value;
  imageUrl.value = '';
  errorMessage.value = '';

  if (!item || !page) return;

  isLoading.value = true;
  try {
    const url = page.kind === 'archive'
      ? await api.getItemImageBase64(item.id, page.entry)
      : await api.getImageBase64ByPath(page.path);
    if (loadToken.value === token) imageUrl.value = url;
  } catch (e: any) {
    if (loadToken.value === token) errorMessage.value = e?.message ?? String(e);
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
      const entries = await api.getItemImages(item.id);
      pages.value = entries.map(entry => ({
        kind: 'archive',
        entry,
        label: entry.split(/[\\/]/).pop() ?? entry,
      }));
    }

    if (loadToken.value !== token) return;
    if (pages.value.length === 0) {
      errorMessage.value = '沒有可閱讀的圖片頁面';
      return;
    }
    await loadCurrentPage();
  } catch (e: any) {
    if (loadToken.value === token) errorMessage.value = e?.message ?? String(e);
  } finally {
    if (loadToken.value === token) isLoading.value = false;
  }
};

const goPrev = () => {
  if (pageIndex.value <= 0) return;
  pageIndex.value -= 1;
  loadCurrentPage();
};

const goNext = () => {
  if (pageIndex.value >= pages.value.length - 1) return;
  pageIndex.value += 1;
  loadCurrentPage();
};

const onKeydown = (event: KeyboardEvent) => {
  if (!props.item) return;
  if (event.key === 'Escape') emit('close');
  if (event.key === 'ArrowLeft') goPrev();
  if (event.key === 'ArrowRight' || event.key === ' ') {
    event.preventDefault();
    goNext();
  }
};

watch(() => props.item, loadPages, { immediate: true });
watch(() => props.item, item => {
  if (item) window.addEventListener('keydown', onKeydown);
  else window.removeEventListener('keydown', onKeydown);
}, { immediate: true });

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="item" class="reader-shell">
      <div class="reader-topbar">
        <div class="reader-title">
          <span class="reader-kicker">READ</span>
          <strong>{{ item.name }}</strong>
        </div>
        <div class="reader-actions">
          <span class="reader-count">{{ pageLabel }}</span>
          <button class="reader-btn" type="button" :disabled="pageIndex <= 0" @click="goPrev">上一頁</button>
          <button class="reader-btn" type="button" :disabled="pageIndex >= pages.length - 1" @click="goNext">下一頁</button>
          <button class="reader-close" type="button" title="關閉" @click="emit('close')">✕</button>
        </div>
      </div>

      <main class="reader-stage" @click="goNext">
        <div v-if="isLoading && !imageUrl" class="reader-state">載入中...</div>
        <div v-else-if="errorMessage" class="reader-state reader-error">{{ errorMessage }}</div>
        <img v-else-if="imageUrl" class="reader-image" :src="imageUrl" :alt="currentPage?.label ?? item.name" />
      </main>

      <div class="reader-bottombar">
        <span>{{ currentPage?.label ?? '' }}</span>
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
  letter-spacing: 0.08em;
  color: rgba(244, 241, 234, 0.6);
}

.reader-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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
