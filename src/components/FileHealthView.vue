<script setup lang="ts">
import { computed, watch } from 'vue';
import DuplicateSection from './DuplicateSection.vue';
import { useExternalChanges, type ExternalChangeKind } from '../composables/useExternalChanges';

const props = defineProps<{
  sourcePath: string | null;
}>();

const {
  changes,
  counts,
  isLoading,
  isFixing,
  lastFixResult,
  refresh,
  fixAll,
  importOne,
  removeMissingOne,
  syncFolderOf,
  dismissOne,
} = useExternalChanges(() => props.sourcePath);

watch(() => props.sourcePath, () => { refresh(); }, { immediate: true });

const kindLabel = (kind: ExternalChangeKind) => {
  if (kind === 'untracked') return '未追蹤';
  if (kind === 'missing') return '找不到';
  return '已變更';
};

const untrackedList = computed(() => changes.value.filter(c => c.kind === 'untracked'));
const missingList = computed(() => changes.value.filter(c => c.kind === 'missing'));
const modifiedList = computed(() => changes.value.filter(c => c.kind === 'modified'));

const hasAny = computed(() => changes.value.length > 0);
</script>

<template>
  <div class="health-view">
    <section class="health-section ext-section">
      <header class="section-header">
        <div class="section-title-row">
          <h2 class="section-title">外部更動</h2>
          <span v-if="props.sourcePath" class="section-count">
            未追蹤 {{ counts.untracked }} ・ 找不到 {{ counts.missing }} ・ 已變更 {{ counts.modified }}
          </span>
          <span v-else class="section-count muted">尚未選擇工作目錄</span>
        </div>
        <div class="section-actions">
          <button
            class="ghost-btn"
            :disabled="!props.sourcePath || isLoading || isFixing"
            @click="refresh"
          >重新檢查</button>
          <button
            class="primary-btn"
            :disabled="!props.sourcePath || !hasAny || isFixing"
            @click="fixAll"
            title="對目前資料夾跑一次增量掃描，三類更動會一起處理"
          >
            {{ isFixing ? '修復中…' : '全部修復' }}
          </button>
        </div>
      </header>

      <div class="section-body">
        <div v-if="!props.sourcePath" class="state-center">
          <p class="state-msg">請從左側選擇工作目錄</p>
        </div>

        <div v-else-if="isLoading" class="state-center">
          <div class="spinner"></div>
          <p>檢查中…</p>
        </div>

        <div v-else-if="!hasAny" class="state-center">
          <div class="state-icon">✅</div>
          <p class="state-msg">沒有偵測到外部更動</p>
          <p v-if="lastFixResult" class="state-hint">
            上次修復：新增 {{ lastFixResult.added }} ・ 更新 {{ lastFixResult.updated }} ・ 移除 {{ lastFixResult.removed }}
          </p>
        </div>

        <div v-else class="ext-groups">
          <div v-if="untrackedList.length" class="ext-group">
            <div class="group-title">
              <span class="kind-badge kind-untracked">未追蹤</span>
              <span class="group-count">{{ untrackedList.length }}</span>
              <span class="group-desc">檔案系統有，資料庫尚未追蹤</span>
            </div>
            <ul class="change-list">
              <li v-for="change in untrackedList" :key="change.kind + change.path" class="change-row">
                <div class="change-info">
                  <span class="change-name">{{ change.name }}</span>
                  <span class="change-path">{{ change.path }}</span>
                </div>
                <div class="change-actions">
                  <button class="action-btn primary" :disabled="isFixing" @click="importOne(change.path)">匯入</button>
                  <button class="action-btn ghost" :disabled="isFixing" @click="dismissOne(change)">略過</button>
                </div>
              </li>
            </ul>
          </div>

          <div v-if="missingList.length" class="ext-group">
            <div class="group-title">
              <span class="kind-badge kind-missing">找不到</span>
              <span class="group-count">{{ missingList.length }}</span>
              <span class="group-desc">資料庫有紀錄，磁碟上找不到</span>
            </div>
            <ul class="change-list">
              <li v-for="change in missingList" :key="change.kind + change.path" class="change-row">
                <div class="change-info">
                  <span class="change-name">{{ change.name }}</span>
                  <span class="change-path">{{ change.path }}</span>
                </div>
                <div class="change-actions">
                  <button class="action-btn danger" :disabled="isFixing" @click="removeMissingOne(change.path)">移除紀錄</button>
                  <button class="action-btn ghost" :disabled="isFixing" @click="dismissOne(change)">略過</button>
                </div>
              </li>
            </ul>
          </div>

          <div v-if="modifiedList.length" class="ext-group">
            <div class="group-title">
              <span class="kind-badge kind-modified">已變更</span>
              <span class="group-count">{{ modifiedList.length }}</span>
              <span class="group-desc">磁碟與資料庫的大小或修改時間不一致</span>
            </div>
            <ul class="change-list">
              <li v-for="change in modifiedList" :key="change.kind + change.path" class="change-row">
                <div class="change-info">
                  <span class="change-name">{{ change.name }}</span>
                  <span class="change-path">{{ change.path }}</span>
                </div>
                <div class="change-actions">
                  <button
                    class="action-btn primary"
                    :disabled="isFixing"
                    @click="syncFolderOf(change.path)"
                    title="對該檔案所在資料夾跑一次增量掃描，會順便處理同資料夾的其他更動"
                  >同步所在資料夾</button>
                  <button class="action-btn ghost" :disabled="isFixing" @click="dismissOne(change)">略過</button>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <DuplicateSection :key="'dup-' + (props.sourcePath ?? '')" />
  </div>
</template>

<style scoped>
.health-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.ext-section {
  border-bottom: 1px solid var(--border-default);
  flex: 0 0 auto;
  max-height: 50%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.health-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.section-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.section-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.section-count {
  font-size: 0.8rem;
  color: var(--text-secondary);
  background: var(--bg-overlay-soft);
  padding: 2px 10px;
  border-radius: 20px;
}
.section-count.muted { opacity: 0.6; }

.section-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.primary-btn {
  background: var(--accent-bg-subtle);
  border: 1px solid var(--accent);
  color: var(--accent-hover);
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.primary-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.primary-btn:hover:not(:disabled) { background: var(--accent-bg-strong); }

.ghost-btn {
  background: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.ghost-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ghost-btn:hover:not(:disabled) { color: var(--text-primary); border-color: var(--accent); }

.section-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 24px 20px;
}

.state-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  gap: 10px;
  color: var(--text-secondary);
}
.state-icon { font-size: 2.4rem; }
.state-msg { font-size: 0.95rem; }
.state-hint { font-size: 0.78rem; opacity: 0.6; }

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--bg-overlay-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.ext-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ext-group {
  border: 1px solid var(--border-default);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-overlay-soft);
}

.group-title {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-default);
}

.kind-badge {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 20px;
  border: 1px solid;
}
.kind-untracked {
  background: var(--accent-bg-subtle);
  color: var(--accent-hover);
  border-color: var(--accent);
}
.kind-missing {
  background: var(--color-danger-bg-subtle);
  color: var(--color-danger);
  border-color: var(--color-danger);
}
.kind-modified {
  background: rgba(240, 178, 41, 0.12);
  color: var(--accent);
  border-color: var(--accent);
}

.group-count {
  font-size: 0.78rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.group-desc {
  font-size: 0.78rem;
  color: var(--text-secondary);
  opacity: 0.75;
}

.change-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.change-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface, transparent);
}
.change-row:last-child { border-bottom: none; }

.change-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.change-name {
  font-size: 0.88rem;
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.change-path {
  font-size: 0.74rem;
  color: var(--text-secondary);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.change-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.action-btn {
  font-size: 0.78rem;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.15s;
  white-space: nowrap;
}
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn.ghost:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--accent);
}
.action-btn.primary {
  background: var(--accent-bg-subtle);
  border-color: var(--accent);
  color: var(--accent-hover);
}
.action-btn.primary:hover:not(:disabled) { background: var(--accent-bg-strong); }
.action-btn.danger {
  background: var(--color-danger-bg-subtle);
  border-color: var(--color-danger);
  color: var(--color-danger);
}
.action-btn.danger:hover:not(:disabled) { filter: brightness(1.1); }

.section-body::-webkit-scrollbar { width: 4px; }
.section-body::-webkit-scrollbar-thumb { background: var(--bg-overlay-strong); border-radius: 10px; }
</style>
