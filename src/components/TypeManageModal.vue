<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, type ItemType, type ItemTypeInput } from '../api';
import { useItemTypes } from '../composables/useItemTypes';
import { useToast } from '../composables/useToast';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { itemTypes, load, invalidate } = useItemTypes();
const { show: showToast, confirm: confirmDialog } = useToast();

const selected = ref<ItemType | null>(null);
const isNew = ref(false);
const saving = ref(false);

const form = ref<{ name: string; icon: string; displayName: string; color: string; extensions: string[] }>({
    name: '', icon: '📁', displayName: '', color: '', extensions: [],
});
const extInput = ref('');

watch(() => props.visible, async (v) => {
    if (v) {
        await load();
        selectFirst();
    }
});

const selectFirst = () => {
    if (itemTypes.value.length > 0) selectType(itemTypes.value[0]);
    else startNew();
};

const selectType = (t: ItemType) => {
    selected.value = t;
    isNew.value = false;
    form.value = { name: t.name, icon: t.icon, displayName: t.displayName, color: t.color ?? '', extensions: [...t.extensions] };
    extInput.value = '';
};

const startNew = () => {
    selected.value = null;
    isNew.value = true;
    form.value = { name: '', icon: '📁', displayName: '', color: '', extensions: [] };
    extInput.value = '';
};

const addExt = () => {
    const ext = extInput.value.trim().toLowerCase().replace(/^\./, '');
    if (ext && !form.value.extensions.includes(ext)) {
        form.value.extensions.push(ext);
    }
    extInput.value = '';
};

const removeExt = (ext: string) => {
    form.value.extensions = form.value.extensions.filter(e => e !== ext);
};

const save = async () => {
    if (!form.value.displayName.trim()) { showToast('請填寫顯示名稱', 'error'); return; }
    if (isNew.value && !form.value.name.trim()) { showToast('請填寫識別名稱', 'error'); return; }
    if (isNew.value && !/^[a-z0-9_]+$/.test(form.value.name)) { showToast('識別名稱只能使用小寫英數字與底線', 'error'); return; }

    saving.value = true;
    try {
        const input: ItemTypeInput = {
            name: form.value.name,
            icon: form.value.icon || '📁',
            displayName: form.value.displayName,
            color: form.value.color || null,
            extensions: form.value.extensions,
        };
        if (isNew.value) {
            const created = await api.createItemType(input);
            invalidate();
            await load(true);
            const t = itemTypes.value.find(x => x.id === created.id);
            if (t) selectType(t);
        } else if (selected.value) {
            const updated = await api.updateItemType(selected.value.id, input);
            invalidate();
            await load(true);
            const t = itemTypes.value.find(x => x.id === updated.id);
            if (t) selectType(t);
        }
        showToast('已儲存', 'success');
    } catch (e: any) {
        showToast('儲存失敗：' + (e?.message ?? e), 'error');
    } finally {
        saving.value = false;
    }
};

const deleteType = async (t: ItemType) => {
    if (t.isBuiltin) return;
    if (!await confirmDialog(`確定刪除「${t.displayName}」類型？\n使用此類型的資料夾將重設為「一般資料夾」。`)) return;
    try {
        await api.deleteItemType(t.id);
        invalidate();
        await load(true);
        selectFirst();
        showToast('已刪除', 'success');
    } catch (e: any) {
        showToast('刪除失敗：' + (e?.message ?? e), 'error');
    }
};
</script>

<template>
    <Teleport to="body">
        <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
            <div class="modal">
                <div class="modal-header">
                    <span class="modal-title">管理類型</span>
                    <button class="close-btn" @click="emit('close')">✕</button>
                </div>
                <div class="modal-body">
                    <!-- 左側列表 -->
                    <div class="type-list">
                        <div
                            v-for="t in itemTypes"
                            :key="t.id"
                            class="type-item"
                            :class="{ active: selected?.id === t.id && !isNew }"
                            @click="selectType(t)"
                        >
                            <span class="type-icon">{{ t.icon }}</span>
                            <span class="type-name">{{ t.displayName }}</span>
                            <span v-if="t.isBuiltin" class="builtin-badge">內建</span>
                            <button
                                v-else
                                class="del-btn"
                                @click.stop="deleteType(t)"
                                title="刪除"
                            >✕</button>
                        </div>
                        <button class="add-type-btn" @click="startNew">＋ 新增類型</button>
                    </div>

                    <!-- 右側表單 -->
                    <div class="type-form">
                        <h3 class="form-title">{{ isNew ? '新增類型' : '編輯類型' }}</h3>

                        <label class="field-label">識別名稱（英數字+底線）</label>
                        <input
                            v-model="form.name"
                            class="field-input"
                            :disabled="!isNew"
                            placeholder="例：novel"
                        />

                        <label class="field-label">顯示名稱</label>
                        <input
                            v-model="form.displayName"
                            class="field-input"
                            placeholder="例：小說"
                        />

                        <label class="field-label">圖示（Emoji）</label>
                        <input
                            v-model="form.icon"
                            class="field-input icon-input"
                            placeholder="📁"
                            maxlength="4"
                        />

                        <label class="field-label">標記顏色（選填）</label>
                        <div class="color-row">
                            <input type="color" v-model="form.color" class="color-picker" />
                            <input v-model="form.color" class="field-input color-text" placeholder="#ffffff（留空表示無顏色）" />
                            <button v-if="form.color" class="clear-color-btn" @click="form.color = ''" title="清除顏色">✕</button>
                        </div>

                        <label class="field-label">允許的副檔名</label>
                        <div class="ext-tags">
                            <span
                                v-for="ext in form.extensions"
                                :key="ext"
                                class="ext-tag"
                            >
                                {{ ext }}
                                <button class="ext-del" @click="removeExt(ext)">×</button>
                            </span>
                            <input
                                v-model="extInput"
                                class="ext-input"
                                placeholder="輸入副檔名後按 Enter"
                                @keydown.enter.prevent="addExt"
                            />
                        </div>
                        <p class="field-hint">不含點號，例：zip、epub、cbz</p>

                        <div class="form-actions">
                            <button class="save-btn" :disabled="saving" @click="save">
                                {{ saving ? '儲存中...' : '儲存' }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}
.modal {
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    border-radius: 14px;
    width: 640px;
    max-width: 95vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--panel-border);
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
.close-btn:hover { color: var(--text-primary); background: rgba(255,255,255,0.07); }
.modal-body {
    display: flex;
    flex: 1;
    overflow: hidden;
}
.type-list {
    width: 200px;
    border-right: 1px solid var(--panel-border);
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
.type-item:hover { background: rgba(255,255,255,0.05); color: var(--text-primary); }
.type-item.active { background: rgba(255,255,255,0.1); color: var(--text-primary); }
.type-icon { font-size: 1rem; flex-shrink: 0; }
.type-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.builtin-badge {
    font-size: 0.65rem;
    color: var(--text-secondary);
    border: 1px solid var(--panel-border);
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
.type-item:hover .del-btn { opacity: 1; }
.del-btn:hover { color: #f87171; }
.add-type-btn {
    margin: 8px 10px 4px;
    background: transparent;
    border: 1px dashed var(--panel-border);
    color: var(--text-secondary);
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: color 0.15s, border-color 0.15s;
}
.add-type-btn:hover { color: var(--text-primary); border-color: var(--accent-color); }
.type-form {
    flex: 1;
    padding: 20px 24px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.form-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 12px;
}
.field-label {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-top: 10px;
}
.field-input {
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--panel-border);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.9rem;
    padding: 6px 10px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    margin-top: 4px;
}
.field-input:disabled { opacity: 0.4; cursor: not-allowed; }
.field-input:focus { border-color: var(--accent-color); }
.icon-input { width: 80px; font-size: 1.2rem; text-align: center; }
.ext-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--panel-border);
    border-radius: 6px;
    padding: 6px 8px;
    margin-top: 4px;
    min-height: 36px;
}
.ext-tag {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 0.8rem;
    color: var(--text-primary);
}
.ext-del {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0;
    line-height: 1;
}
.ext-del:hover { color: #f87171; }
.ext-input {
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 0.85rem;
    min-width: 120px;
    flex: 1;
}
.ext-input::placeholder { color: var(--text-secondary); }
.field-hint {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin: 2px 0 0;
}
.form-actions {
    margin-top: 16px;
}
.save-btn {
    background: var(--accent-color);
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 0.9rem;
    padding: 8px 20px;
    cursor: pointer;
    transition: opacity 0.15s;
}
.save-btn:hover:not(:disabled) { opacity: 0.85; }
.save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.color-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.color-picker { width: 36px; height: 32px; border: 1px solid var(--panel-border); border-radius: 6px; padding: 2px; background: transparent; cursor: pointer; flex-shrink: 0; }
.color-text { flex: 1; }
.clear-color-btn { background: transparent; border: 1px solid var(--panel-border); border-radius: 4px; color: var(--text-secondary); font-size: 0.75rem; padding: 4px 6px; cursor: pointer; flex-shrink: 0; }
.clear-color-btn:hover { color: #f87171; }
</style>
