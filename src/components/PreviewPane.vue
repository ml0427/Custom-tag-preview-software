<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api, type Item, type Tag, type FileItem } from '../api';
import { useItemTypes } from '../composables/useItemTypes';

const props = defineProps<{
    item: Item | null;
    fileItem?: FileItem | null;
}>();

const emit = defineEmits<{
    (e: 'showDetail', item: Item): void
    (e: 'showFolderDetail', item: Item): void
    (e: 'renamed', item: Item): void
    (e: 'tagClick', tag: Tag): void
    (e: 'close'): void
}>();

const coverUrl = ref('');
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const ZIP_EXTS = ['zip', 'cbz', 'cbr', 'rar', '7z'];
const { getTypeByExtension } = useItemTypes();

const filePlaceholderIcon = computed(() => {
    if (props.item?.itemType === 'folder' || props.fileItem?.isDir) return '📁';
    const ext = props.item
        ? (props.item.path.split('.').pop() ?? '')
        : (props.fileItem?.extension ?? '');
    const matched = getTypeByExtension(ext);
    if (matched) return matched.icon;
    if (IMAGE_EXTS.includes(ext.toLowerCase())) return '🖼️';
    return '📄';
});

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

const tagStyle = (color?: string | null) => {
    if (!color) return {};
    return { background: `${color}22`, color, borderColor: `${color}66` };
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

        <!-- Header -->
        <div class="pane-header">
            <span class="pane-title">PREVIEW</span>
            <button class="pane-close" @click="emit('close')" title="關閉預覽">✕</button>
        </div>

        <!-- File item preview -->
        <div v-if="item && item.itemType === 'file'" class="content">
            <div class="cover-wrapper" @click="emit('showDetail', item)">
                <img v-if="coverUrl" :src="coverUrl" :alt="item.name" class="preview-cover" />
                <div v-else class="cover-placeholder">{{ filePlaceholderIcon }}</div>
                <div class="zoom-overlay"><span>點擊查看詳情</span></div>
            </div>

            <div class="info-scroll">
                <h3 class="item-title">{{ item.name }}</h3>

                <div class="meta-row">
                    <span class="meta-val">{{ formatSize(item.fileSize) }}</span>
                    <span class="meta-sep">·</span>
                    <span class="meta-val">{{ formatDate(item.fileModifiedAt) }}</span>
                </div>

                <div class="section">
                    <div class="section-label">標籤</div>
                    <div class="tags-container">
                        <span
                            v-for="tag in item.tags" :key="tag.id"
                            class="tag clickable-tag"
                            :style="tagStyle(tag.color)"
                            @click="emit('tagClick', tag)"
                        >{{ tag.name }}</span>
                        <span v-if="item.tags.length === 0" class="no-tags">尚未添加標籤</span>
                    </div>
                </div>

                <div class="section" v-if="item.note">
                    <div class="section-label">備注</div>
                    <div class="notes-box">{{ item.note }}</div>
                </div>
            </div>

            <div class="pane-footer">
                <button class="footer-btn btn-edit" @click="emit('showDetail', item)">✏️ 編輯</button>
                <button class="footer-btn btn-open" @click="api.openFile(item.path)">▶ 開啟</button>
            </div>
        </div>

        <!-- Folder item preview -->
        <div v-else-if="item && item.itemType === 'folder'" class="content">
            <div class="cover-wrapper" @click="emit('showFolderDetail', item)">
                <img v-if="coverUrl" :src="coverUrl" :alt="item.name" class="preview-cover" />
                <div v-else class="cover-placeholder">📁</div>
                <div class="zoom-overlay"><span>點擊查看詳情</span></div>
            </div>

            <div class="info-scroll">
                <h3 class="item-title">{{ item.name }}</h3>

                <div class="section">
                    <div class="section-label">標籤</div>
                    <div class="tags-container">
                        <span
                            v-for="tag in item.tags" :key="tag.id"
                            class="tag clickable-tag"
                            :style="tagStyle(tag.color)"
                            @click="emit('tagClick', tag)"
                        >{{ tag.name }}</span>
                        <span v-if="item.tags.length === 0" class="no-tags">尚未添加標籤</span>
                    </div>
                </div>

                <div class="section" v-if="item.note">
                    <div class="section-label">備注</div>
                    <div class="notes-box">{{ item.note }}</div>
                </div>
            </div>

            <div class="pane-footer">
                <button class="footer-btn btn-edit" @click="emit('showFolderDetail', item)">✏️ 編輯</button>
            </div>
        </div>

        <!-- Unscanned file preview -->
        <div v-else-if="fileItem && !fileItem.isDir" class="content">
            <div class="cover-wrapper">
                <img v-if="coverUrl" :src="coverUrl" :alt="fileItem.name" class="preview-cover" />
                <div v-else class="cover-placeholder">{{ filePlaceholderIcon }}</div>
            </div>

            <div class="info-scroll">
                <h3 class="item-title">{{ fileItem.name }}</h3>

                <div class="meta-row">
                    <span class="meta-val">{{ formatSize(fileItem.fileSize) }}</span>
                    <span class="meta-sep" v-if="fileItem.modifiedTime">·</span>
                    <span class="meta-val" v-if="fileItem.modifiedTime">{{ fileItem.modifiedTime }}</span>
                </div>

                <div class="section">
                    <div class="section-label">標籤</div>
                    <div class="tags-container">
                        <span class="no-tags">尚未掃描</span>
                    </div>
                </div>
            </div>

            <div class="pane-footer">
                <button class="footer-btn btn-open" @click="api.openFile(fileItem.path)">▶ 開啟</button>
            </div>
        </div>

        <!-- Unscanned folder preview -->
        <div v-else-if="fileItem && fileItem.isDir" class="content">
            <div class="cover-wrapper">
                <img v-if="coverUrl" :src="coverUrl" :alt="fileItem.name" class="preview-cover" />
                <div v-else class="cover-placeholder">📁</div>
            </div>

            <div class="info-scroll">
                <h3 class="item-title">{{ fileItem.name }}</h3>
                <div class="section">
                    <div class="section-label">標籤</div>
                    <div class="tags-container">
                        <span class="no-tags">尚未掃描</span>
                    </div>
                </div>
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
    transition: width 0.3s ease;
}

/* Header */
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

/* Empty state */
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

/* Content area */
.content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* Cover */
.cover-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 3/4;
    overflow: hidden;
    cursor: pointer;
    background: var(--bg-image-placeholder);
    flex-shrink: 0;
    max-height: 45%;
}

.preview-cover {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: transform 0.5s ease;
}
.cover-wrapper:hover .preview-cover { transform: scale(1.04); }

.cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 4rem;
    background: var(--bg-overlay-soft);
}

.zoom-overlay {
    position: absolute;
    inset: 0;
    background: var(--bg-scrim);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s ease;
    font-size: 0.85rem;
    color: #fff;
}
.cover-wrapper:hover .zoom-overlay { opacity: 1; }

/* Info scroll */
.info-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 16px 16px 8px;
}
.info-scroll::-webkit-scrollbar { width: 4px; }
.info-scroll::-webkit-scrollbar-thumb { background: var(--bg-overlay-strong); border-radius: 10px; }

.item-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.4;
    word-break: break-word;
    margin-bottom: 8px;
}

.meta-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 16px;
}
.meta-val {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
}
.meta-sep { font-size: 11px; color: var(--border-default); }

/* Sections */
.section { margin-bottom: 16px; }

.section-label {
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    margin-bottom: 8px;
}

.tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}

.tag {
    background: var(--accent-bg-subtle);
    color: var(--accent);
    padding: 3px 10px;
    border-radius: 100px;
    font-size: 0.82rem;
    border: 1px solid var(--accent);
}
.clickable-tag { cursor: pointer; transition: background 0.15s, border-color 0.15s; }
.clickable-tag:hover { background: var(--accent-bg-strong); border-color: var(--accent-hover); }

.no-tags { font-style: italic; color: var(--text-tertiary); font-size: 0.85rem; }

.notes-box {
    background: var(--bg-overlay-soft);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.6;
    word-break: break-word;
    white-space: pre-wrap;
}

/* Footer */
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
