<script setup lang="ts">
import { watch } from 'vue';
import CategoryList from './CategoryList.vue';
import CategoryEditor from './CategoryEditor.vue';
import { useCategoryManage } from '../composables/useCategoryManage';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const {
    itemTypes,
    load,
    selected,
    isNew,
    saving,
    form,
    extInput,
    selectFirst,
    selectType,
    startNew,
    addRule,
    removeRule,
    addExt,
    removeExt,
    save,
    deleteType
} = useCategoryManage();

watch(() => props.visible, async (v) => {
    if (v) {
        await load();
        selectFirst();
    }
});
</script>

<template>
    <Teleport to="body">
        <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
            <div class="modal">
                <div class="modal-header">
                    <span class="modal-title">管理類別</span>
                    <button class="close-btn" @click="emit('close')">✕</button>
                </div>
                <div class="modal-body">
                    <CategoryList
                        :itemTypes="itemTypes"
                        :selectedId="selected?.id ?? null"
                        :isNew="isNew"
                        @select="selectType"
                        @startNew="startNew"
                        @delete="deleteType"
                    />

                    <CategoryEditor
                        :isNew="isNew"
                        :saving="saving"
                        :form="form"
                        v-model:extInput="extInput"
                        @addExt="addExt"
                        @removeExt="removeExt"
                        @addRule="addRule"
                        @removeRule="removeRule"
                        @save="save"
                    />
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    inset: 0;
    background: var(--bg-scrim);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2100;
}
.modal {
    background: var(--bg-panel);
    border: 1px solid var(--border-default);
    border-radius: 14px;
    width: 640px;
    max-width: 95vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: var(--shadow-modal);
}
.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
}
.modal-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
}
.close-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.9rem;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
}
.close-btn:hover { color: var(--text-primary); background: var(--bg-overlay-soft); }
.modal-body {
    display: flex;
    flex: 1;
    overflow: hidden;
}
</style>
