<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    isNew: boolean;
    saving: boolean;
    extInput: string;
    form: {
        name: string;
        icon: string;
        displayName: string;
        color: string;
        extensions: string[];
        tagRules: Array<{ matchType: string; pattern: string; tagName: string }>;
    };
}>();

const emit = defineEmits<{
    (e: 'update:extInput', val: string): void;
    (e: 'addExt'): void;
    (e: 'removeExt', ext: string): void;
    (e: 'addRule'): void;
    (e: 'removeRule', index: number): void;
    (e: 'save'): void;
}>();

// computed getters/setters for v-model to props mutation warning fix
const localExtInput = computed({
    get: () => props.extInput,
    set: (val) => emit('update:extInput', val)
});
</script>

<template>
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
                <button class="ext-del" @click="emit('removeExt', ext)">×</button>
            </span>
            <input
                v-model="localExtInput"
                class="ext-input"
                placeholder="輸入副檔名後按 Enter"
                @keydown.enter.prevent="emit('addExt')"
            />
        </div>
        <p class="field-hint">不含點號，例：zip、epub、cbz</p>

        <label class="field-label field-label--spaced">自動標記規則</label>
        <p class="field-hint">指定此類別後，自動對資料夾內的檔案套用以下規則打標籤</p>
        <div class="rule-list">
            <div v-for="(rule, i) in form.tagRules" :key="i" class="rule-row">
                <select v-model="rule.matchType" class="rule-select">
                    <option value="prefix">前綴</option>
                    <option value="suffix">後綴</option>
                    <option value="contains">包含</option>
                    <option value="regex">正則</option>
                    <option value="regex_capture">正則擷取</option>
                </select>
                <input v-model="rule.pattern" class="rule-input" placeholder="模式" />
                <input
                    v-model="rule.tagName"
                    class="rule-input"
                    placeholder="標籤名稱"
                    :disabled="rule.matchType === 'regex_capture'"
                    :title="rule.matchType === 'regex_capture' ? '正則擷取模式下，標籤名稱由括號捕捉組決定' : ''"
                />
                <button class="rule-del" @click="emit('removeRule', i)" title="刪除">✕</button>
            </div>
            <button class="add-rule-btn" @click="emit('addRule')">＋ 新增規則</button>
        </div>

        <div class="form-actions">
            <button class="save-btn" :disabled="saving" @click="emit('save')">
                {{ saving ? '儲存中...' : '儲存' }}
            </button>
        </div>
    </div>
</template>

<style scoped>
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
.field-label--spaced { margin-top: 16px; }
.field-input {
    background: var(--bg-overlay-soft);
    border: 1px solid var(--border-default);
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
.field-input:focus { border-color: var(--accent); }
.icon-input { width: 80px; font-size: 1.2rem; text-align: center; }
.ext-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    background: var(--bg-overlay-soft);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    padding: 6px 8px;
    margin-top: 4px;
    min-height: 36px;
}
.ext-tag {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--bg-overlay-strong);
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
.ext-del:hover { color: var(--color-danger); }
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
.rule-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
}
.rule-row {
    display: flex;
    gap: 6px;
    align-items: center;
}
.rule-select {
    -webkit-appearance: none;
    appearance: none;
    background: var(--bg-input);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.82rem;
    padding: 5px 6px;
    outline: none;
    flex-shrink: 0;
    width: 90px;
    cursor: pointer;
}
.rule-select:focus { border-color: var(--accent); }
.rule-input {
    background: var(--bg-input);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.85rem;
    padding: 5px 8px;
    outline: none;
    flex: 1;
    min-width: 0;
    font-family: inherit;
}
.rule-input:focus { border-color: var(--accent); }
.rule-input:disabled { opacity: 0.3; cursor: not-allowed; }
.rule-del {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    flex-shrink: 0;
    transition: color 0.15s;
}
.rule-del:hover { color: var(--color-danger); }
.add-rule-btn {
    background: transparent;
    border: 1px dashed var(--border-default);
    color: var(--text-secondary);
    border-radius: 6px;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 0.82rem;
    transition: color 0.15s, border-color 0.15s;
    align-self: flex-start;
    margin-top: 2px;
}
.add-rule-btn:hover { color: var(--text-primary); border-color: var(--accent); }
.form-actions {
    margin-top: 16px;
}
.save-btn {
    background: var(--accent);
    border: none;
    border-radius: 6px;
    color: var(--text-on-accent);
    font-size: 0.9rem;
    padding: 8px 20px;
    cursor: pointer;
    transition: opacity 0.15s;
}
.save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.save-btn:hover:not(:disabled) { opacity: 0.85; }
.color-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.color-picker { width: 36px; height: 32px; border: 1px solid var(--border-default); border-radius: 6px; padding: 2px; background: transparent; cursor: pointer; flex-shrink: 0; }
.color-text { flex: 1; }
.clear-color-btn { background: transparent; border: 1px solid var(--border-default); border-radius: 4px; color: var(--text-secondary); font-size: 0.75rem; padding: 4px 6px; cursor: pointer; flex-shrink: 0; }
.clear-color-btn:hover { color: var(--color-danger); }
</style>
