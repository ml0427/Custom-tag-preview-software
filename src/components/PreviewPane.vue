<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api, type Comic } from '../api';

const props = defineProps<{
    comic: Comic | null
}>();

const emit = defineEmits<{
    (e: 'showDetail', comic: Comic): void
}>();

const coverUrl = ref('');

watch(() => props.comic?.id, async (id) => {
    if (!id) { coverUrl.value = ''; return; }
    try {
        coverUrl.value = await api.getCoverBase64(id);
    } catch {
        coverUrl.value = '';
    }
}, { immediate: true });

const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    if (!bytes) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};
</script>

<template>
    <div class="preview-pane" :class="{ 'empty': !comic }">
        <div v-if="comic" class="content">
            <div class="cover-wrapper" @click="emit('showDetail', comic)">
                <img :src="coverUrl" :alt="comic.title" class="preview-cover" />
                <div class="zoom-overlay">
                    <span>點擊查看詳情</span>
                </div>
            </div>
            
            <div class="info-scroll">
                <div class="title-container">
                    <h3 class="comic-title">{{ comic.title }}</h3>
                </div>
                
                <div class="meta-section">
                    <div class="meta-item">
                        <span class="label">檔案大小</span>
                        <span class="value">{{ formatSize(comic.fileSize || 0) }}</span>
                    </div>
                    <div class="meta-item">
                        <span class="label">修改日期</span>
                        <span class="value">{{ formatDate(comic.fileModifiedTime) }}</span>
                    </div>
                </div>

                <div class="tags-section">
                    <h4>標籤</h4>
                    <div class="tags-container">
                        <span v-for="tag in comic.tags" :key="tag.id" class="tag">
                            {{ tag.name }}
                        </span>
                        <span v-if="comic.tags.length === 0" class="no-tags">尚未添加標籤</span>
                    </div>
                </div>

                <div class="path-section">
                    <h4>路徑</h4>
                    <div class="path-box">{{ comic.filePath }}</div>
                </div>
            </div>
            
            <button class="btn-primary detail-btn" @click="emit('showDetail', comic)">
                編輯詳情
            </button>
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
    backdrop-filter: var(--glass-blur);
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

.empty-icon {
    font-size: 4rem;
    margin-bottom: 20px;
}

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

.cover-wrapper:hover .preview-cover {
    transform: scale(1.05);
}

.zoom-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.cover-wrapper:hover .zoom-overlay {
    opacity: 1;
}

.info-scroll {
    flex: 1;
    overflow-y: auto;
    margin-bottom: 20px;
    padding-right: 8px;
}

.title-container {
    margin-bottom: 20px;
}

.comic-title {
    font-size: 1.4rem;
    color: var(--text-primary);
    line-height: 1.4;
    word-break: break-all;
    flex: 1;
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

.meta-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.label {
    font-size: 0.8rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.value {
    font-size: 0.95rem;
    color: var(--text-primary);
    font-weight: 500;
}

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

.no-tags {
    font-style: italic;
    color: var(--text-tertiary);
}

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

.detail-btn {
    width: 100%;
    padding: 12px;
    font-weight: 600;
}

/* Custom Scrollbar */
.info-scroll::-webkit-scrollbar {
    width: 4px;
}
.info-scroll::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.1);
    border-radius: 10px;
}
</style>
