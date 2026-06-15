<script setup lang="ts">
import { computed } from 'vue';
import RuleTester from './RuleTester.vue';

interface RuleFormItem {
    matchType: string;
    pattern: string;
    tagName: string;
}

interface CategoryForm {
    name: string;
    icon: string;
    displayName: string;
    color: string;
    example: string;
    extensions: string[];
    tagRules: RuleFormItem[];
}

const props = defineProps<{
    isNew: boolean;
    saving: boolean;
    extInput: string;
    form: CategoryForm;
}>();

const emit = defineEmits<{
    (e: 'update:extInput', val: string): void;
    (e: 'addExt'): void;
    (e: 'removeExt', ext: string): void;
    (e: 'addRule'): void;
    (e: 'removeRule', index: number): void;
    (e: 'save'): void;
}>();

const localExtInput = computed({
    get: () => props.extInput,
    set: (val) => emit('update:extInput', val)
});

const matchTypeOptions = [
    { value: 'prefix', label: '前綴', hint: '從檔名開頭比對' },
    { value: 'suffix', label: '後綴', hint: '從檔名結尾比對' },
    { value: 'contains', label: '包含', hint: '檔名包含文字' },
    { value: 'regex', label: '正規', hint: '正規表達式命中' },
    { value: 'regex_capture', label: '正規擷取', hint: '用括號擷取標籤' },
];

const editorTitle = computed(() => props.isNew ? '建立標籤規則集' : '編輯標籤規則集');
const ruleCount = computed(() => props.form.tagRules.length);
const extensionCount = computed(() => props.form.extensions.length);
const scopeSummary = computed(() => extensionCount.value === 0 ? '所有副檔名' : `${extensionCount.value} 個副檔名`);
</script>

<template>
    <div class="type-form">
        <header class="form-header">
            <div class="form-title-block">
                <span class="form-eyebrow">Rule set editor</span>
                <h3>{{ editorTitle }}</h3>
                <p>定義檔案適用範圍與自動套標籤規則。這是自動化模板，不會改變資料夾本身。</p>
            </div>
            <div class="form-stats" aria-label="規則集摘要">
                <span><strong>{{ scopeSummary }}</strong></span>
                <span><strong>{{ ruleCount }}</strong> 規則</span>
            </div>
        </header>

        <section class="editor-card">
            <div class="section-heading">
                <span class="section-index">01</span>
                <div>
                    <h4>基本識別</h4>
                    <p>給規則集一個可辨識的名稱、圖示與顏色。</p>
                </div>
            </div>

            <div class="field-grid">
                <label class="field-block">
                    <span class="field-label">識別名稱</span>
                    <input
                        v-model="form.name"
                        class="field-input mono-input"
                        :disabled="!isNew"
                        placeholder="例：novel"
                    />
                    <small>僅限小寫英數字與底線，建立後不可修改。</small>
                </label>

                <label class="field-block">
                    <span class="field-label">顯示名稱</span>
                    <input
                        v-model="form.displayName"
                        class="field-input"
                        placeholder="例：小說"
                    />
                    <small>顯示在設定、右鍵選單與資料夾自動化區塊。</small>
                </label>

                <label class="field-block compact-field">
                    <span class="field-label">圖示</span>
                    <input
                        v-model="form.icon"
                        class="field-input icon-input"
                        placeholder="📁"
                        maxlength="4"
                    />
                </label>

                <div class="field-block">
                    <span class="field-label">標記顏色</span>
                    <div class="color-row">
                        <input type="color" v-model="form.color" class="color-picker" />
                        <input v-model="form.color" class="field-input color-text" placeholder="#ffffff（留空表示無顏色）" />
                        <button v-if="form.color" type="button" class="icon-btn danger" @click="form.color = ''" title="清除顏色">✕</button>
                    </div>
                </div>
            </div>

            <label class="field-block full-field">
                <span class="field-label">範例檔名</span>
                <textarea
                    v-model="form.example"
                    class="field-input field-textarea"
                    rows="2"
                    placeholder="例：[進擊的巨人(第一季、完結)] 第01話.mkv"
                ></textarea>
                <small>純記錄用，也會成為即時測試的預設提示。</small>
            </label>
        </section>

        <section class="editor-card">
            <div class="section-heading">
                <span class="section-index">02</span>
                <div>
                    <h4>適用範圍</h4>
                    <p>限制哪些副檔名會使用這套規則；留空代表不限制。</p>
                </div>
            </div>

            <div class="ext-tags">
                <span
                    v-for="ext in form.extensions"
                    :key="ext"
                    class="ext-tag"
                >
                    {{ ext }}
                    <button type="button" class="ext-del" @click="emit('removeExt', ext)" aria-label="移除副檔名">×</button>
                </span>
                <input
                    v-model="localExtInput"
                    class="ext-input"
                    placeholder="輸入副檔名後按 Enter 新增，例如 zip、epub、cbz"
                    @keydown.enter.prevent="emit('addExt')"
                />
            </div>
            <p class="field-hint">不含點號；資料夾預設規則可另外限制是否套用到子資料夾與檔案。</p>
        </section>

        <section class="editor-card">
            <div class="section-heading with-action">
                <span class="section-index">03</span>
                <div>
                    <h4>自動標記規則</h4>
                    <p>依檔名命中條件後自動加上標籤；正規擷取模式會使用括號擷取結果當標籤。</p>
                </div>
                <button type="button" class="secondary-btn" @click="emit('addRule')">＋ 新增規則</button>
            </div>

            <div v-if="form.tagRules.length === 0" class="empty-rules">
                尚未建立規則。可以先新增一條「包含」或「正規擷取」規則，再用下方即時測試確認命中結果。
            </div>

            <div v-else class="rule-list">
                <div v-for="(rule, index) in form.tagRules" :key="index" class="rule-row">
                    <span class="rule-number">{{ index + 1 }}</span>
                    <label class="rule-field rule-field--type">
                        <span>比對方式</span>
                        <select v-model="rule.matchType" class="rule-select">
                            <option
                                v-for="option in matchTypeOptions"
                                :key="option.value"
                                :value="option.value"
                            >{{ option.label }}</option>
                        </select>
                    </label>
                    <label class="rule-field">
                        <span>模式</span>
                        <input v-model="rule.pattern" class="rule-input mono-input" placeholder="例如 [作者] 或 ^\[(.+?)\]" />
                    </label>
                    <label class="rule-field">
                        <span>標籤名稱</span>
                        <input
                            v-model="rule.tagName"
                            class="rule-input"
                            placeholder="例：作者 / 待整理"
                            :disabled="rule.matchType === 'regex_capture'"
                            :title="rule.matchType === 'regex_capture' ? '正規擷取模式下，標籤名稱由括號擷取組決定' : ''"
                        />
                    </label>
                    <button type="button" class="icon-btn danger" @click="emit('removeRule', index)" title="刪除規則">✕</button>
                </div>
            </div>
        </section>

        <section class="editor-card">
            <div class="section-heading">
                <span class="section-index">04</span>
                <div>
                    <h4>即時測試</h4>
                    <p>輸入檔名後會直接顯示哪些規則命中與產生的標籤。</p>
                </div>
            </div>
            <RuleTester
                :rules="form.tagRules"
                :placeholder="form.example || '輸入測試檔名…'"
            />
        </section>

        <footer class="form-actions">
            <button type="button" class="save-btn" :disabled="saving" @click="emit('save')">
                {{ saving ? '儲存中...' : '儲存規則集' }}
            </button>
        </footer>
    </div>
</template>

<style scoped>
.type-form {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
}

.form-header,
.editor-card,
.form-actions {
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
    box-shadow: var(--shadow-sm);
}

.form-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px;
}

.form-title-block,
.section-heading > div,
.field-block,
.rule-field {
    min-width: 0;
}

.form-eyebrow {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--text-tertiary);
}

.form-title-block h3,
.section-heading h4 {
    margin: 6px 0;
    color: var(--text-primary);
    letter-spacing: -0.02em;
}

.form-title-block h3 {
    font-size: 1.15rem;
}

.form-title-block p,
.section-heading p,
.field-hint,
.field-block small {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.55;
    font-size: 0.78rem;
}

.form-stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
    flex-shrink: 0;
}

.form-stats span {
    display: inline-flex;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    padding: 5px 8px;
    background: var(--bg-overlay-soft);
    color: var(--text-secondary);
    font-size: 0.72rem;
}

.form-stats strong {
    color: var(--text-primary);
}

.editor-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    min-width: 0;
}

.section-heading {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
}

.section-heading.with-action {
    align-items: center;
}

.section-heading.with-action > div {
    flex: 1;
}

.section-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid var(--accent-border);
    background: var(--accent-bg-subtle);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    flex-shrink: 0;
}

.section-heading h4 {
    font-size: 0.98rem;
}

.field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.field-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.full-field {
    width: 100%;
}

.compact-field {
    max-width: 120px;
}

.field-label,
.rule-field span {
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
}

.field-input,
.rule-input,
.rule-select {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    background: var(--bg-input);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.88rem;
    padding: 8px 10px;
    outline: none;
    font-family: inherit;
    transition: border-color var(--transition-fast), background var(--transition-fast);
}

.field-input:disabled,
.rule-input:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.mono-input {
    font-family: var(--font-mono);
}

.icon-input {
    text-align: center;
    font-size: 1.15rem;
}

.field-textarea {
    resize: vertical;
    min-height: 54px;
    line-height: 1.45;
}

.color-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.color-picker {
    width: 38px;
    height: 36px;
    flex-shrink: 0;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: 2px;
    background: transparent;
    cursor: pointer;
}

.color-text {
    flex: 1;
}

.ext-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    align-items: center;
    min-width: 0;
    min-height: 44px;
    background: var(--bg-input);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: 8px;
}

.ext-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
    background: var(--accent-bg-subtle);
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-pill);
    padding: 3px 8px;
    color: var(--accent);
    font-size: 0.78rem;
}

.ext-del {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: currentColor;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}

.ext-input {
    flex: 1 1 160px;
    min-width: 0;
    width: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    outline: none;
    color: var(--text-primary);
    font-size: 0.85rem;
    padding: 5px 6px;
}

.ext-input::placeholder,
.field-input::placeholder,
.rule-input::placeholder {
    color: var(--text-tertiary);
}

.rule-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.rule-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    min-width: 0;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-overlay-soft);
    padding: 10px;
}

.rule-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 34px;
    flex-shrink: 0;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 0.72rem;
}

.rule-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex: 1 1 0;
}

.rule-field--type {
    flex: 0.65 1 0;
}

.rule-select {
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
}

.field-input:focus,
.rule-input:focus,
.rule-select:focus,
.ext-input:focus {
    border-color: var(--accent);
    box-shadow: var(--ring-focus);
}

.empty-rules {
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-md);
    background: var(--bg-overlay-soft);
    color: var(--text-secondary);
    padding: 14px;
    line-height: 1.6;
    font-size: 0.82rem;
}

.secondary-btn,
.save-btn,
.icon-btn {
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), opacity var(--transition-fast);
}

.secondary-btn {
    flex-shrink: 0;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    padding: 8px 10px;
    font-size: 0.82rem;
}

.secondary-btn:hover {
    border-color: var(--accent-border);
    background: var(--accent-bg-subtle);
    color: var(--text-primary);
}

.icon-btn {
    flex-shrink: 0;
    width: 32px;
    height: 34px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-default);
    background: transparent;
    color: var(--text-tertiary);
}

.icon-btn.danger:hover {
    border-color: var(--color-danger);
    background: var(--color-danger-bg-subtle);
    color: var(--color-danger);
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    padding: 12px 14px;
    flex-shrink: 0;
}

.save-btn {
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--text-on-accent);
    font-size: 0.9rem;
    font-weight: 700;
    padding: 9px 18px;
    box-shadow: var(--shadow-accent-elevated);
}

.save-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.save-btn:hover:not(:disabled) {
    background: var(--accent-hover);
}

@media (max-width: 760px) {
    .type-form {
        overflow: visible;
    }

    .form-header,
    .section-heading.with-action {
        flex-direction: column;
        align-items: stretch;
    }

    .form-stats {
        justify-content: flex-start;
    }

    .field-grid {
        grid-template-columns: 1fr;
    }

    .compact-field {
        max-width: none;
    }

    .rule-row {
        flex-wrap: wrap;
        align-items: stretch;
    }

    .rule-number {
        width: auto;
        height: auto;
        padding-top: 8px;
    }

    .rule-field,
    .rule-field--type {
        flex-basis: 100%;
    }

    .icon-btn {
        width: 100%;
    }

    .secondary-btn,
    .save-btn {
        width: 100%;
    }
}
</style>
