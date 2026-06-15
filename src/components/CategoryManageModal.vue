<script setup lang="ts">
import { computed, watch } from 'vue';
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

const totalRules = computed(() => itemTypes.value.reduce((sum, type) => sum + type.tagRules.length, 0));
const customRuleSets = computed(() => itemTypes.value.filter(type => !type.isBuiltin).length);
const selectedTitle = computed(() => isNew.value ? '新增規則集' : (selected.value?.displayName ?? '選擇規則集'));

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
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="rule-set-modal-title">
                <header class="modal-header">
                    <div class="title-block">
                        <span class="modal-eyebrow">Automation presets</span>
                        <h2 id="rule-set-modal-title">標籤規則集工作台</h2>
                        <p>建立自動套標籤的規則集。規則集可被資料夾預設引用，但不會改變資料夾本身。</p>
                    </div>
                    <div class="header-side">
                        <div class="summary-pills" aria-label="規則集摘要">
                            <span><strong>{{ itemTypes.length }}</strong> 規則集</span>
                            <span><strong>{{ customRuleSets }}</strong> 自訂</span>
                            <span><strong>{{ totalRules }}</strong> 規則</span>
                        </div>
                        <button type="button" class="close-btn" aria-label="關閉" @click="emit('close')">✕</button>
                    </div>
                </header>

                <div class="modal-body">
                    <CategoryList
                        :itemTypes="itemTypes"
                        :selectedId="selected?.id ?? null"
                        :isNew="isNew"
                        @select="selectType"
                        @startNew="startNew"
                        @delete="deleteType"
                    />

                    <section class="editor-shell" aria-label="規則集編輯區">
                        <div class="editor-context">
                            <span class="context-label">正在編輯</span>
                            <strong>{{ selectedTitle }}</strong>
                        </div>
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
                    </section>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    inset: 0;
    background: var(--bg-scrim-heavy);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2100;
    padding: 24px;
}

.modal {
    width: min(1040px, 96vw);
    max-height: min(88vh, 860px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background:
        radial-gradient(circle at 0% 0%, var(--accent-bg-subtle), transparent 36%),
        var(--bg-panel);
    border: 1px solid var(--border-default);
    border-radius: 18px;
    box-shadow: var(--shadow-modal);
}

.modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
}

.title-block,
.header-side,
.editor-shell {
    min-width: 0;
}

.modal-eyebrow,
.context-label {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
}

.title-block h2 {
    margin: 7px 0 8px;
    color: var(--text-primary);
    font-size: clamp(1.35rem, 2.4vw, 2rem);
    line-height: 1.05;
    letter-spacing: -0.03em;
}

.title-block p {
    max-width: 640px;
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
    line-height: 1.6;
}

.header-side {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    flex-shrink: 0;
}

.summary-pills {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
}

.summary-pills span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 8px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    background: var(--bg-overlay-soft);
    font-size: 0.72rem;
    white-space: nowrap;
}

.summary-pills strong {
    color: var(--text-primary);
}

.close-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-overlay-soft);
    border: 1px solid var(--border-default);
    color: var(--text-secondary);
    font-size: 0.85rem;
    cursor: pointer;
    border-radius: 50%;
    transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}

.close-btn:hover {
    color: var(--text-primary);
    background: var(--bg-overlay-strong);
    border-color: var(--border-strong);
}

.modal-body {
    display: grid;
    grid-template-columns: minmax(0, 0.38fr) minmax(0, 1fr);
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.editor-shell {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--bg-app) 18%, transparent);
}

.editor-context {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-primary);
    flex-shrink: 0;
    min-width: 0;
}

.editor-context strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
}

@media (max-width: 820px) {
    .modal-overlay {
        align-items: stretch;
        padding: 12px;
    }

    .modal {
        width: 100%;
        max-height: none;
        height: 100%;
        border-radius: 14px;
    }

    .modal-header {
        flex-direction: column;
    }

    .header-side {
        width: 100%;
        justify-content: space-between;
    }

    .summary-pills {
        justify-content: flex-start;
    }

    .modal-body {
        grid-template-columns: 1fr;
        overflow-y: auto;
    }

    .editor-shell {
        border-left: none;
        border-top: 1px solid var(--border-subtle);
        overflow: visible;
    }
}
</style>
