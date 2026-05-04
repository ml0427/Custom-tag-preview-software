<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useDuplicateScanner } from '../composables/useDuplicateScanner';

const {
  groups, isLoading, isComputing, progress,
  loadGroups, runCompute, trashItemInGroup, keepNewestInGroup
} = useDuplicateScanner();

let unlisten: UnlistenFn | null = null;

const formatSize = (bytes: number | null) => {
    if (!bytes) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (unix: number | null) => {
    if (!unix) return '-';
    return new Date(unix * 1000).toLocaleDateString('zh-TW');
};

onMounted(async () => {
    unlisten = await listen<{ current: number; total: number }>('fingerprint-progress', ({ payload }) => {
        progress.value = payload;
    });
    await loadGroups();
});

onUnmounted(() => { unlisten?.(); });
</script>

<template>
    <div class="dup-view">
        <div class="dup-header">
            <div class="dup-title-row">
                <h2 class="dup-title">重複檔案偵測</h2>
                <span v-if="!isLoading && !isComputing" class="dup-count">
                    {{ groups.length > 0 ? `${groups.length} 組重複` : '無重複' }}
                </span>
            </div>
            <button class="compute-btn" :disabled="isComputing || isLoading" @click="runCompute">
                <span v-if="isComputing">
                    計算中… {{ progress.total > 0 ? `${progress.current}/${progress.total}` : '' }}
                </span>
                <span v-else>計算 / 更新指紋</span>
            </button>
        </div>

        <div class="dup-body">
            <div v-if="isLoading" class="state-center">
                <div class="spinner"></div>
                <p>載入中…</p>
            </div>

            <div v-else-if="groups.length === 0" class="state-center">
                <div class="state-icon">✅</div>
                <p class="state-msg">沒有發現重複檔案</p>
                <p class="state-hint">若剛加入新檔案，請先點「計算 / 更新指紋」</p>
            </div>

            <div v-else class="group-list">
                <div v-for="(group, gi) in groups" :key="group.fingerprint" class="group-card glass-panel">
                    <div class="group-header">
                        <div class="group-meta">
                            <span class="group-badge">{{ group.items.length }} 份</span>
                            <span class="group-fp">{{ group.fingerprint.slice(0, 12) }}…</span>
                            <span class="group-size">{{ formatSize(group.items[0].fileSize) }}</span>
                        </div>
                        <button class="keep-btn" @click="keepNewestInGroup(gi)" title="保留最新，刪除其餘">
                            保留最新
                        </button>
                    </div>

                    <div class="item-list">
                        <div v-for="item in group.items" :key="item.id" class="dup-item">
                            <div class="item-info">
                                <span class="item-name">{{ item.name }}</span>
                                <span class="item-path">{{ item.path }}</span>
                                <span class="item-date">匯入：{{ formatDate(item.fileModifiedAt) }}</span>
                            </div>
                            <button class="trash-btn" @click="trashItemInGroup(item, gi)" title="移至資源回收筒">
                                🗑
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.dup-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.dup-header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.dup-title-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.dup-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
}

.dup-count {
    font-size: 0.8rem;
    color: var(--text-secondary);
    background: var(--bg-overlay-soft);
    padding: 2px 10px;
    border-radius: 20px;
}

.compute-btn {
    background: var(--accent-bg-subtle);
    border: 1px solid var(--accent);
    color: var(--accent-hover);
    padding: 7px 16px;
    border-radius: 8px;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
    flex-shrink: 0;
}
.compute-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.compute-btn:hover:not(:disabled) { background: var(--accent-bg-strong); }

.dup-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
}

.state-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    gap: 10px;
    color: var(--text-secondary);
}

.state-icon { font-size: 3rem; }
.state-msg { font-size: 1rem; }
.state-hint { font-size: 0.8rem; opacity: 0.6; }

.spinner {
    width: 36px;
    height: 36px;
    border: 3px solid var(--bg-overlay-strong);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.group-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.group-card {
    border-radius: 12px;
    overflow: hidden;
}

.group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--bg-overlay-soft);
    border-bottom: 1px solid var(--border-default);
}

.group-meta {
    display: flex;
    align-items: center;
    gap: 10px;
}

.group-badge {
    background: var(--color-danger-bg-subtle);
    color: var(--color-danger);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 2px 9px;
    border-radius: 20px;
}

.group-fp {
    font-family: monospace;
    font-size: 0.78rem;
    color: var(--text-secondary);
}

.group-size {
    font-size: 0.8rem;
    color: var(--text-secondary);
}

.keep-btn {
    background: transparent;
    border: 1px solid var(--border-default);
    color: var(--text-secondary);
    font-size: 0.8rem;
    padding: 4px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
}
.keep-btn:hover { color: var(--text-primary); border-color: var(--accent); }

.item-list {
    display: flex;
    flex-direction: column;
}

.dup-item {
    display: flex;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-subtle);
    gap: 12px;
}
.dup-item:last-child { border-bottom: none; }
.dup-item:hover { background: var(--bg-overlay-soft); }

.item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.item-name {
    font-size: 0.88rem;
    color: var(--text-primary);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.item-path {
    font-size: 0.75rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
}

.item-date {
    font-size: 0.72rem;
    color: var(--text-secondary);
    opacity: 0.6;
}

.trash-btn {
    background: transparent;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
    opacity: 0.4;
    transition: opacity 0.15s, background 0.15s;
    flex-shrink: 0;
}
.trash-btn:hover { opacity: 1; background: var(--color-danger-bg-subtle); }

.dup-body::-webkit-scrollbar { width: 4px; }
.dup-body::-webkit-scrollbar-thumb { background: var(--bg-overlay-strong); border-radius: 10px; }
</style>
