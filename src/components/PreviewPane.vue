<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api, type Item, type Tag } from '../api';
import { useItemTypes } from '../composables/useItemTypes';

const props = defineProps<{
    item: Item | null;
}>();

const emit = defineEmits<{
    (e: 'showDetail', item: Item): void
    (e: 'showFolderDetail', item: Item): void
    (e: 'renamed', item: Item): void
    (e: 'tagClick', tag: Tag): void
}>();

const coverUrl = ref('');
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const { getTypeByExtension } = useItemTypes();

const filePlaceholderIcon = computed(() => {
    if (!props.item || props.item.itemType !== 'file') return '📄';
    const ext = props.item.path.split('.').pop() ?? '';
    const matched = getTypeByExtension(ext);
    if (matched) return matched.icon;
    if (IMAGE_EXTS.includes(ext.toLowerCase())) return '🖼️';
    return '📄';
});

// Load cover for file items (ZIP)
watch(() => [props.item?.id, props.item?.coverCachePath], async () => {
    const item = props.item;
    if (!item || item.itemType !== 'file') return;
    try {
        coverUrl.value = await api.getCoverBase64(item.id);
    } catch {
        coverUrl.value = '';
    }
}, { immediate: true });

// Load cover for folder items (first image in directory)
watch(() => props.item?.path, async (folderPath) => {
    const item = props.item;
    if (!item || item.itemType !== 'folder') return;
    if (!folderPath) { coverUrl.value = ''; return; }
    coverUrl.value = '';
    try {
        const files = await api.listDirFiles(folderPath);
        let firstImage = files.find(f =>
            !f.isDir && IMAGE_EXTS.includes(f.extension?.toLowerCase() ?? '')
        );
        if (!firstImage) {
            const firstDir = files.find(f => f.isDir);
            if (firstDir) {
                const subFiles = await api.listDirFiles(firstDir.path);
                firstImage = subFiles.find(f =>
                    !f.isDir && IMAGE_EXTS.includes(f.extension?.toLowerCase() ?? '')
                );
            }
        }
        if (firstImage) {
            coverUrl.value = await api.getImageBase64ByPath(firstImage.path);
        }
    } catch { coverUrl.value = ''; }
}, { immediate: true });

// Also clear cover when switching item types
watch(() => props.item, (newItem) => {
    if (!newItem) coverUrl.value = '';
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
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};
</script>

<template>
    <div class="preview-pane" :class="{ 'empty': !item }">
        <!-- File item preview -->
        <div v-if="item && item.itemType === 'file'" class="content">
            <div class="cover-wrapper" @click="emit('showDetail', item)">
                <img v-if="coverUrl" :src="coverUrl" :alt="item.name" class="preview-cover" />
                <div v-else class="cover-placeholder">{{ filePlaceholderIcon }}</div>
                <div class="zoom-overlay"><span>點擊查看詳情</span></div>
            </div>

            <div class="info-scroll">
                <div class="title-container">
                    <h3 class="item-title">{{ item.name }}</h3>
                </div>

                <div class="meta-section">
                    <div class="meta-item">
                        <span class="label">檔案大小</span>
                        <span class="value">{{ formatSize(item.fileSize) }}</span>
                    </div>
                    <div class="meta-item">
                        <span class="label">修改日期</span>
                        <span class="value">{{ formatDate(item.fileModifiedAt) }}</span>
                    </div>
                </div>

                <div class="tags-section">
                    <h4>標籤</h4>
                    <div class="tags-container">
                        <span v-for="tag in item.tags" :key="tag.id" class="tag clickable-tag" @click="emit('tagClick', tag)">{{ tag.name }}</span>
                        <span v-if="item.tags.length === 0" class="no-tags">尚未添加標籤</span>
                    </div>
                </div>

                <div class="path-section">
                    <h4>路徑</h4>
                    <div class="path-box">{{ item.path }}</div>
                </div>
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
                <div class="title-container">
                    <h3 class="item-title">{{ item.name }}</h3>
                </div>

                <div class="tags-section">
                    <h4>標籤</h4>
                    <div class="tags-container">
                        <span v-for="tag in item.tags" :key="tag.id" class="tag clickable-tag" @click="emit('tagClick', tag)">{{ tag.name }}</span>
                        <span v-if="item.tags.length === 0" class="no-tags">尚未添加標籤</span>
                    </div>
                </div>

                <div class="path-section">
                    <h4>路徑</h4>
                    <div class="path-box">{{ item.path }}</div>
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
    background: var(--panel-bg);
    border-left: 1px solid var(--panel-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 0.3s ease;
}

.empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    opacity: 0.6;
}

.empty-icon { font-size: 4rem; margin-bottom: 20px; }

.content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 24px;
    overflow: hidden;
}

.cover-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 3/4;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 24px;
    box-shadow: 0 8px 16px rgba(0,0,0,0.3);
    cursor: pointer;
    background: #000;
}

.preview-cover {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: transform 0.5s ease;
}

.cover-wrapper:hover .preview-cover { transform: scale(1.05); }

.cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 5rem;
    background: rgba(255,255,255,0.03);
}

.zoom-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s ease;
}
.cover-wrapper:hover .zoom-overlay { opacity: 1; }

.info-scroll {
    flex: 1;
    overflow-y: auto;
    margin-bottom: 20px;
    padding-right: 8px;
}

.title-container { margin-bottom: 20px; }

.item-title {
    font-size: 1.4rem;
    color: var(--text-primary);
    line-height: 1.4;
    word-break: break-all;
}

.meta-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 24px;
    background: rgba(255,255,255,0.05);
    padding: 12px;
    border-radius: 8px;
}

.meta-item { display: flex; flex-direction: column; gap: 4px; }

.label {
    font-size: 0.8rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.value { font-size: 0.95rem; color: var(--text-primary); font-weight: 500; }

.tags-section h4, .path-section h4 {
    font-size: 0.9rem;
    margin-bottom: 12px;
    color: var(--text-secondary);
}

.tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 24px;
}

.tag {
    background: var(--accent-color-transparent);
    color: var(--accent-color);
    padding: 4px 10px;
    border-radius: 100px;
    font-size: 0.85rem;
    border: 1px solid rgba(139, 92, 246, 0.3);
}

.clickable-tag {
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
}
.clickable-tag:hover {
    background: rgba(139, 92, 246, 0.3);
    border-color: rgba(139, 92, 246, 0.6);
}

.no-tags { font-style: italic; color: var(--text-tertiary); }

.path-box {
    background: rgba(0,0,0,0.2);
    padding: 10px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--text-secondary);
    word-break: break-all;
    line-height: 1.4;
}

.action-buttons { display: flex; flex-direction: column; gap: 8px; }

.detail-btn { width: 100%; padding: 12px; font-weight: 600; }

.btn-open {
    width: 100%;
    padding: 10px;
    font-weight: 500;
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
}
.btn-open:hover:not(:disabled) { background: rgba(255,255,255,0.12); color: var(--text-primary); }
.btn-open:disabled { opacity: 0.4; cursor: not-allowed; }

.info-scroll::-webkit-scrollbar { width: 4px; }
.info-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>
