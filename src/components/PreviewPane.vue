<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, type Item, type Tag, type FileItem } from '../api';
import MediaViewer from './MediaViewer.vue';
import MetadataPanel from './MetadataPanel.vue';

const props = defineProps<{
    item: Item | null;
    fileItem?: FileItem | null;
}>();

const emit = defineEmits<{
    (e: 'showDetail', item: Item): void
    (e: 'showFolderDetail', item: Item): void
    (e: 'tagClick', tag: Tag): void
    (e: 'close'): void
}>();

const coverUrl = ref('');
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const ZIP_EXTS = ['zip', 'cbz', 'cbr', 'rar', '7z'];

const coverLoadToken = ref(0);

const loadCover = async () => {
    const token = ++coverLoadToken.value;
    coverUrl.value = '';

    const item = props.item;
    const fi = props.fileItem;

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
    } else if (fi && !fi.isDir) {
        const ext = fi.extension?.toLowerCase() ?? '';
        try {
            let url: string;
            if (ZIP_EXTS.includes(ext)) {
                url = await api.getZipCoverByPath(fi.path);
            } else if (IMAGE_EXTS.includes(ext)) {
                url = await api.getImageBase64ByPath(fi.path);
            } else {
                return;
            }
            if (coverLoadToken.value === token) coverUrl.value = url;
        } catch {}
    } else if (fi?.isDir) {
        try {
            const files = await api.listDirFiles(fi.path);
            const firstImage = files.find(f =>
                !f.isDir && IMAGE_EXTS.includes(f.extension?.toLowerCase() ?? '')
            );
            if (firstImage) {
                const url = await api.getImageBase64ByPath(firstImage.path);
                if (coverLoadToken.value === token) coverUrl.value = url;
            }
        } catch {}
    }
};

watch([() => props.item, () => props.fileItem], loadCover, { immediate: true });

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
</script>

<template>
    <div class="preview-pane" :class="{ 'empty': !item && !fileItem }">
        <div class="pane-header">
            <span class="pane-title">PREVIEW</span>
            <button class="pane-close" @click="emit('close')" title="關閉預覽">✕</button>
        </div>

        <div v-if="item" class="content">
            <MediaViewer
              :item="item"
              :coverUrl="coverUrl"
              @click="item.itemType === 'file' ? emit('showDetail', item) : emit('showFolderDetail', item)"
            />
            <MetadataPanel
              :title="item.name"
              :size="item.itemType === 'file' ? formatSize(item.fileSize) : undefined"
              :date="item.itemType === 'file' ? formatDate(item.fileModifiedAt) : undefined"
              :tags="item.tags"
              :note="item.note"
              @tagClick="emit('tagClick', $event)"
            />
            <div class="pane-footer">
                <button class="footer-btn btn-edit" @click="item.itemType === 'file' ? emit('showDetail', item) : emit('showFolderDetail', item)">
                  ✏️ 編輯
                </button>
                <button v-if="item.itemType === 'file'" class="footer-btn btn-open" @click="api.openFile(item.path)">▶ 開啟</button>
            </div>
        </div>

        <div v-else-if="fileItem" class="content">
            <MediaViewer
              :item="null"
              :fileItem="fileItem"
              :coverUrl="coverUrl"
            />
            <MetadataPanel
              :title="fileItem.name"
              :size="!fileItem.isDir ? formatSize(fileItem.fileSize) : undefined"
              :date="!fileItem.isDir ? fileItem.modifiedTime || undefined : undefined"
              :tags="[]"
              :scanned="false"
            />
            <div class="pane-footer" v-if="!fileItem.isDir">
                <button class="footer-btn btn-open" @click="api.openFile(fileItem.path)">▶ 開啟</button>
            </div>
        </div>

        <div v-else class="empty-state">
            <div class="empty-icon">📂</div>
            <p>選取一個檔案來預覽詳細資訊</p>
        </div>
    </div>
</template>

<style scoped>
.preview-pane {
    width: 350px;
    height: 100%;
    background: var(--bg-panel);
    border-left: 1px solid var(--border-default);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.pane-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
}

.pane-title {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.15em;
    color: var(--text-tertiary);
    text-transform: uppercase;
}

.pane-close {
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    font-size: 0.85rem;
    cursor: pointer;
    padding: 2px 6px;
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
    color: var(--text-secondary);
    opacity: 0.6;
}
.empty-icon { font-size: 3rem; margin-bottom: 16px; }

.content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.pane-footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-subtle);
    flex-shrink: 0;
}

.footer-btn {
    flex: 1;
    padding: 8px 12px;
    border-radius: 7px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border-default);
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
}

.btn-edit {
    background: var(--bg-overlay-soft);
    color: var(--text-primary);
}
.btn-edit:hover { background: var(--bg-overlay-strong); }

.btn-open {
    background: var(--accent);
    color: var(--bg-app);
    border-color: var(--accent);
    font-weight: 600;
}
.btn-open:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
</style>
