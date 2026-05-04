<script setup lang="ts">
import type { ItemType } from '../api';

defineProps<{
    itemTypes: ItemType[];
    selectedId: number | null;
    isNew: boolean;
}>();

const emit = defineEmits<{
    (e: 'select', type: ItemType): void;
    (e: 'startNew'): void;
    (e: 'delete', type: ItemType): void;
}>();
</script>

<template>
    <div class="type-list">
        <div
            v-for="t in itemTypes"
            :key="t.id"
            class="type-item"
            :class="{ active: selectedId === t.id && !isNew }"
            @click="emit('select', t)"
        >
            <span class="type-icon">{{ t.icon }}</span>
            <span class="type-name">{{ t.displayName }}</span>
            <span v-if="t.isBuiltin" class="builtin-badge">內建</span>
            <button
                v-else
                class="del-btn"
                @click.stop="emit('delete', t)"
                title="刪除"
            >✕</button>
        </div>
        <button class="add-type-btn" @click="emit('startNew')">＋ 新增類型</button>
    </div>
</template>

<style scoped>
.type-list {
    width: 200px;
    border-right: 1px solid var(--border-default);
    overflow-y: auto;
    padding: 8px 0;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
}
.type-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 0.9rem;
    transition: background 0.15s, color 0.15s;
}
.type-item:hover { background: var(--bg-overlay-soft); color: var(--text-primary); }
.type-item.active { background: var(--bg-overlay-strong); color: var(--text-primary); }
.type-icon { font-size: 1rem; flex-shrink: 0; }
.type-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.builtin-badge {
    font-size: 0.65rem;
    color: var(--text-secondary);
    border: 1px solid var(--border-default);
    border-radius: 3px;
    padding: 1px 4px;
    flex-shrink: 0;
}
.del-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
}
.del-btn:hover { color: var(--color-danger); }
.type-item:hover .del-btn { opacity: 1; }
.add-type-btn {
    margin: 8px 10px 4px;
    background: transparent;
    border: 1px dashed var(--border-default);
    color: var(--text-secondary);
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: color 0.15s, border-color 0.15s;
}
.add-type-btn:hover { color: var(--text-primary); border-color: var(--accent); }
</style>
