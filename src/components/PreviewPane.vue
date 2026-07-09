<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, type Item, type Tag } from '../api';
import MediaViewer from './MediaViewer.vue';
import MetadataPanel from './MetadataPanel.vue';
import PreviewEditPanel from './PreviewEditPanel.vue';
import { openFileAndRecord } from '../utils/openTracking';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
    item: Item | null;
    allTags: Tag[];
    initialTab?: 'info' | 'edit';
}>();

const emit = defineEmits<{
    (e: 'tagClick', tag: Tag): void
    (e: 'updated'): void
    (e: 'tagsChanged'): void
    (e: 'deleted'): void
    (e: 'close'): void
}>();

const coverUrl = ref('');
const activeTab = ref<'info' | 'edit'>(props.initialTab ?? 'info');
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const ZIP_EXTS = ['zip', 'cbz', 'cbr', 'rar', '7z'];

const coverLoadToken = ref(0);

const loadCover = async () => {
    const token = ++coverLoadToken.value;
    coverUrl.value = '';

    const item = props.item;

    if (item) {
        if (item.itemType === 'file') {
            try {
                const url = await api.getCoverBase64(item.id);
                if (coverLoadToken.value === token) coverUrl.value = url;
            } catch {}
        } else if (item.itemType === 'folder') {
            try {
                const files = await api.listDirFiles(item.path);
                const firstImage = files.find(f =>
                    !f.isDir && IMAGE_EXTS.includes(f.extension?.toLowerCase() ?? '')
                );
                if (firstImage) {
                    const url = await api.getImageBase64ByPath(firstImage.path);
                    if (coverLoadToken.value === token) coverUrl.value = url;
                }
            } catch {}
        }
    }
};

watch(() => props.item, () => {
    activeTab.value = props.initialTab ?? 'info';
    loadCover();
}, { immediate: true });

watch(() => props.initialTab, (tab) => {
    activeTab.value = tab ?? 'info';
});

const formatSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (unix: number | null) => {
    if (!unix) return '-';
    return new Date(unix * 1000).toLocaleString('zh-TW', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
};

const openItem = async () => {
    if (!props.item) return;
    await openFileAndRecord(props.item.path, api.openFile, api.recordItemOpen);
    emit('updated');
};
</script>

<template>
    <div class="preview-pane inspector-panel" :class="{ 'empty': !item }" aria-label="項目 Inspector">
        <div class="pane-header inspector-identity">
            <div>
                <span class="pane-kicker">Record inspector</span>
                <span class="pane-title">項目資料</span>
            </div>
            <button class="pane-close" @click="emit('close')" title="關閉 Inspector" aria-label="關閉 Inspector">
                <AppIcon name="x" :size="15" />
            </button>
        </div>

        <div v-if="item" class="content inspector-content">
            <div class="pane-tabs inspector-tabs" role="tablist" aria-label="預覽模式">
                <button
                  class="pane-tab"
                  :class="{ active: activeTab === 'info' }"
                  type="button"
                  role="tab"
                  :aria-selected="activeTab === 'info'"
                  @click="activeTab = 'info'"
                >
                  資訊
                </button>
                <button
                  class="pane-tab"
                  :class="{ active: activeTab === 'edit' }"
                  type="button"
                  role="tab"
                  :aria-selected="activeTab === 'edit'"
                  @click="activeTab = 'edit'"
                >
                  編輯
                </button>
            </div>

            <template v-if="activeTab === 'info'">
                <div class="inspector-scroll">
                    <div class="inspector-media">
                        <MediaViewer
                          :item="item"
                          :coverUrl="coverUrl"
                          @click="activeTab = 'edit'"
                        />
                    </div>
                    <MetadataPanel
                      :title="item.name"
                      :size="item.itemType === 'file' ? formatSize(item.fileSize) : undefined"
                      :date="item.itemType === 'file' ? formatDate(item.fileModifiedAt) : undefined"
                      :tags="item.tags"
                      :note="item.note"
                      @tagClick="emit('tagClick', $event)"
                    />
                </div>
            </template>

            <PreviewEditPanel
              v-else
              :item="item"
              :allTags="allTags"
              @updated="emit('updated')"
              @tagsChanged="emit('tagsChanged')"
              @deleted="emit('deleted')"
            />

            <div class="pane-footer inspector-actions">
                <button class="footer-btn btn-edit" @click="activeTab = activeTab === 'edit' ? 'info' : 'edit'">
                  {{ activeTab === 'edit' ? '資訊' : '編輯' }}
                </button>
                <button v-if="item.itemType === 'file'" class="footer-btn btn-open" @click="openItem">
                    <AppIcon name="play" :size="14" /> 開啟
                </button>
            </div>
        </div>

        <div v-else class="empty-state">
            <span class="empty-icon"><AppIcon name="panel-right" :size="26" /></span>
            <span class="pane-kicker">No record selected</span>
            <p>選取一個項目，在這裡查看內容、Metadata 與標籤。</p>
        </div>
    </div>
</template>

<style scoped>
.preview-pane {
    width: 350px;
    height: 100%;
    background: var(--surface-panel);
    border-left: 1px solid var(--line-default);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.pane-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 68px;
    padding: 13px 16px;
    border-bottom: 1px solid var(--line-default);
    border-top: 2px solid var(--catalog-spine);
    flex-shrink: 0;
}

.pane-title {
    display: block;
    margin-top: 4px;
    color: var(--content-primary);
    font-family: var(--font-jp);
    font-size: 0.95rem;
    font-weight: 600;
}

.pane-kicker {
    display: block;
    font-family: var(--font-mono);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.15em;
    color: var(--content-muted);
    text-transform: uppercase;
}

.pane-close {
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    cursor: pointer;
    padding: 0;
    border-radius: 4px;
    line-height: 1;
    transition: color 0.15s, background 0.15s;
}
.pane-close:hover { color: var(--text-primary); background: var(--bg-overlay-soft); }

.empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 28px;
    color: var(--content-muted);
    text-align: center;
}
.empty-icon {
    width: 52px;
    height: 52px;
    margin-bottom: 7px;
    display: grid;
    place-items: center;
    color: var(--accent);
    background: var(--accent-bg-subtle);
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-lg);
}

.empty-state p {
    max-width: 250px;
    font-size: 0.76rem;
    line-height: 1.6;
}

.content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.inspector-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.inspector-media {
    padding: 12px 14px 0;
}

.pane-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 10px 14px 0;
    flex-shrink: 0;
}

.pane-tab {
    min-width: 0;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    padding: 7px 8px;
    font-size: 0.78rem;
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.pane-tab:hover {
    background: var(--bg-overlay-soft);
    color: var(--text-primary);
}

.pane-tab.active {
    border-color: var(--accent);
    background: var(--accent-bg-subtle);
    color: var(--accent);
}

.pane-footer {
    display: flex;
    gap: 8px;
    padding: 14px 16px;
    border-top: 1px solid var(--line-default);
    flex-shrink: 0;
}

.footer-btn {
    flex: 1;
    padding: 8px 10px;
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    background: transparent;
    border: 1px solid var(--border-default);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}

@media (max-width: 1279px) {
    .inspector-panel { max-width: 340px; }
}

@media (max-width: 959px) {
    .inspector-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 320;
        width: min(360px, calc(100vw - 64px)) !important;
        min-width: 0 !important;
        box-shadow: var(--shadow-modal);
    }
}

.footer-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-bg-subtle);
}

.btn-edit {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-bg-subtle);
}

.btn-edit:hover {
    background: var(--accent-bg-strong);
}

.btn-open {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg-app);
    font-weight: 600;
}

.btn-open:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
    color: var(--bg-app);
}

</style>
