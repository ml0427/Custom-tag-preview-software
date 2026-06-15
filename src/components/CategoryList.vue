<script setup lang="ts">
import type { ItemType } from '../api';

const props = defineProps<{
    itemTypes: ItemType[];
    selectedId: number | null;
    isNew: boolean;
}>();

const emit = defineEmits<{
    (e: 'select', type: ItemType): void;
    (e: 'startNew'): void;
    (e: 'delete', type: ItemType): void;
}>();

const formatExtensionCount = (type: ItemType) => (
    type.extensions.length === 0 ? '不限副檔名' : `${type.extensions.length} 副檔名`
);

const formatRuleCount = (type: ItemType) => `${type.tagRules.length} 規則`;
</script>

<template>
    <aside class="rule-set-library">
        <div class="library-header">
            <span class="library-eyebrow">Rule sets</span>
            <h3>規則集庫</h3>
            <p>選擇一組規則來編輯，或新增自訂自動化規則集。</p>
        </div>

        <button
            type="button"
            class="add-type-btn"
            :class="{ active: isNew }"
            @click="emit('startNew')"
        >
            <span class="add-mark">＋</span>
            <span class="add-type-content">
                <strong>新增規則集</strong>
                <small>建立新的套標籤模板</small>
            </span>
        </button>

        <div class="type-list" role="list" aria-label="標籤規則集清單">
            <div
                v-for="type in props.itemTypes"
                :key="type.id"
                role="button"
                tabindex="0"
                class="type-item"
                :class="{ active: selectedId === type.id && !isNew }"
                @click="emit('select', type)"
                @keydown.enter.prevent="emit('select', type)"
                @keydown.space.prevent="emit('select', type)"
            >
                <span class="type-icon" :style="{ color: type.color ?? undefined }">{{ type.icon }}</span>
                <span class="type-copy">
                    <span class="type-name">{{ type.displayName }}</span>
                    <span class="type-meta">
                        <span>{{ formatExtensionCount(type) }}</span>
                        <span>{{ formatRuleCount(type) }}</span>
                    </span>
                </span>
                <span v-if="type.isBuiltin" class="builtin-badge">內建</span>
                <button
                    v-else
                    type="button"
                    class="del-btn"
                    @click.stop="emit('delete', type)"
                    title="刪除規則集"
                    aria-label="刪除規則集"
                >✕</button>
            </div>
        </div>
    </aside>
</template>

<style scoped>
.rule-set-library {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    padding: 18px;
    overflow: hidden;
    background: color-mix(in srgb, var(--bg-panel) 88%, transparent);
}

.library-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex-shrink: 0;
}

.library-eyebrow {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
}

.library-header h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1rem;
    letter-spacing: -0.01em;
}

.library-header p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.78rem;
    line-height: 1.5;
}

.add-type-btn,
.type-item {
    width: 100%;
    min-width: 0;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.add-type-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border: 1px dashed var(--border-default);
    background: var(--accent-bg-subtle);
    color: var(--text-primary);
    text-align: left;
    flex-shrink: 0;
}

.add-type-btn:hover,
.add-type-btn.active {
    border-color: var(--accent-border);
    background: var(--accent-bg-strong);
}

.add-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--text-on-accent);
    flex-shrink: 0;
    font-weight: 700;
}

.add-type-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.add-type-btn strong {
    font-size: 0.86rem;
}

.add-type-btn small {
    color: var(--text-secondary);
    font-size: 0.72rem;
}

.type-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow-y: auto;
    padding-right: 2px;
}

.type-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    text-align: left;
}

.type-item:hover {
    background: var(--bg-overlay-soft);
    color: var(--text-primary);
}

.type-item.active {
    background: var(--bg-overlay-strong);
    border-color: var(--accent-border);
    color: var(--text-primary);
}

.type-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: var(--bg-overlay-soft);
    border: 1px solid var(--border-subtle);
    font-size: 1.1rem;
    flex-shrink: 0;
}

.type-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
}

.type-name {
    color: var(--text-primary);
    font-size: 0.86rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.type-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
}

.type-meta span,
.builtin-badge {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    padding: 2px 6px;
    background: var(--bg-overlay-soft);
    color: var(--text-tertiary);
    font-size: 0.66rem;
    line-height: 1.2;
    white-space: nowrap;
}

.builtin-badge {
    color: var(--accent);
    border-color: var(--accent-border);
    background: var(--accent-bg-subtle);
    flex-shrink: 0;
}

.del-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-tertiary);
    font-size: 0.72rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--transition-fast), color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
}

.del-btn:hover {
    color: var(--color-danger);
    background: var(--color-danger-bg-subtle);
    border-color: var(--color-danger);
}

.type-item:hover .del-btn,
.type-item:focus-within .del-btn {
    opacity: 1;
}

@media (max-width: 820px) {
    .rule-set-library {
        overflow: visible;
    }

    .type-list {
        max-height: 260px;
    }
}
</style>
