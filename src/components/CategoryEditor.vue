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

const editorTitle = computed(() => props.isNew ? '新增標籤規則集' : props.form.displayName);
const ruleCount = computed(() => props.form.tagRules.length);
const extensionCount = computed(() => props.form.extensions.length);
const scopeSummary = computed(() => extensionCount.value === 0 ? '所有副檔名' : `${extensionCount.value} 個副檔名`);
</script>

<template>
    <div class="type-form">
        <header class="form-header">
            <div class="form-title-block">
                <h2>{{ editorTitle }}</h2>
                <p>{{ ruleCount }} 條標籤規則 · {{ scopeSummary }}</p>
            </div>
            <button type="button" class="save-btn" :disabled="saving" @click="emit('save')">
                {{ saving ? '儲存中…' : '儲存規則集' }}
            </button>
        </header>

        <details class="basic-settings" :open="isNew">
            <summary>名稱、圖示、顏色與適用檔案</summary>
            <section class="editor-card">
                <div class="section-heading">
                    <div>
                        <h4>名稱與外觀</h4>
                        <p>給規則集一個可辨識的名稱、圖示與顏色。</p>
                    </div>
                </div>

                <div class="field-grid">
                    <label class="field-block">
                        <span class="field-label">內部識別名稱</span>
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

        </details>

        <section class="editor-card">
            <div class="section-heading with-action">
                <div>
                    <h3>自動標籤規則</h3>
                    <p>依檔名命中條件後自動加上標籤；正規擷取模式會使用括號擷取結果當標籤。</p>
                </div>
                <button type="button" class="secondary-btn" @click="emit('addRule')">＋ 新增規則</button>
            </div>

            <div v-if="form.tagRules.length === 0" class="empty-rules">
                尚未建立規則。可以先新增一條「包含」或「正規擷取」規則，再用下方即時測試確認命中結果。
            </div>

            <div v-else class="rule-list">
                <div v-for="(rule, index) in form.tagRules" :key="index" class="rule-row">
                    <div class="rule-heading">
                        <strong>規則 {{ index + 1 }}</strong>
                        <button type="button" class="icon-btn danger" @click="emit('removeRule', index)" :aria-label="'刪除規則 ' + (index + 1)" title="刪除規則">✕</button>
                    </div>
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
                    <p v-if="rule.matchType === 'regex_capture'" class="field-hint">標籤由括號內的擷取結果產生。</p>
                    <label v-else class="rule-field">
                        <span>標籤名稱</span>
                        <input
                            v-model="rule.tagName"
                            class="rule-input"
                            placeholder="例：作者 / 待整理"
                        />
                    </label>
                </div>
            </div>
        </section>

        <section class="editor-card">
            <div class="section-heading">
                <div>
                    <h3>測試檔名</h3>
                    <p>輸入檔名後會直接顯示哪些規則命中與產生的標籤。</p>
                </div>
            </div>
            <RuleTester
                :rules="form.tagRules"
                :placeholder="form.example || '輸入測試檔名…'"
            />
        </section>



    </div>
</template>


<style scoped>
.type-form {
    display: flex;
    flex-direction: column;
    gap: 24px;
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 20px;
    overflow-y: auto;
}
.form-header {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0 16px;
    border-bottom: 1px solid var(--line-default);
    background: var(--bg-app);
}
.form-title-block { min-width: 0; }
.form-title-block h2 { margin: 0 0 5px; color: var(--content-primary); font-size: 1.2rem; font-weight: 600; overflow-wrap: anywhere; }
.form-title-block p,
.section-heading p,
.field-hint,
.field-block small { margin: 0; color: var(--content-secondary); font-size: 0.78rem; line-height: 1.6; }
.editor-card { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.section-heading { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.section-heading > div { flex: 1; min-width: 0; }
.section-heading.with-action { align-items: center; }
.section-heading h3,
.section-heading h4 { margin: 0 0 5px; color: var(--content-primary); font-size: 0.9rem; font-weight: 600; }
.rule-list { display: flex; flex-direction: column; gap: 12px; }
.rule-row { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 16px; border: 1px solid var(--line-default); border-radius: var(--radius-md); background: var(--surface-panel); }
.rule-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.rule-heading strong { color: var(--content-secondary); font-size: 0.76rem; font-weight: 500; }
.field-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.field-block,
.rule-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field-label,
.rule-field > span { color: var(--content-secondary); font-size: 0.78rem; }
.rule-field--type { max-width: 220px; }
.compact-field { max-width: 120px; }
.field-input,
.rule-input,
.rule-select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 36px; padding: 8px 10px; border: 1px solid var(--line-default); border-radius: var(--radius-sm); background: var(--surface-input); color: var(--content-primary); font: inherit; font-size: 0.84rem; }
.field-input:disabled,
.rule-input:disabled { opacity: 0.5; cursor: not-allowed; }
.mono-input { font-family: var(--font-mono); }
.icon-input { text-align: center; }
.field-textarea { resize: vertical; line-height: 1.5; }
.color-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.color-picker { flex-shrink: 0; width: 38px; height: 36px; padding: 2px; border: 1px solid var(--line-default); border-radius: var(--radius-sm); background: var(--surface-input); cursor: pointer; }
.color-text { flex: 1; }
.ext-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; min-width: 0; padding: 8px; border: 1px solid var(--line-default); border-radius: var(--radius-sm); background: var(--surface-input); }
.ext-tag { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: var(--radius-sm); background: var(--accent-bg-subtle); color: var(--accent); font-size: 0.78rem; }
.ext-del { padding: 0; border: none; background: transparent; color: inherit; }
.ext-input { flex: 1 1 160px; min-width: 0; padding: 5px; border: none; background: transparent; color: var(--content-primary); font: inherit; font-size: 0.8rem; }
.basic-settings { border-top: 1px solid var(--line-default); padding-top: 16px; }
.basic-settings > summary { padding: 4px 0; color: var(--content-secondary); font-size: 0.82rem; cursor: pointer; }
summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.basic-settings[open] > summary { margin-bottom: 20px; color: var(--content-primary); }
.basic-settings > .editor-card + .editor-card { margin-top: 24px; }
.empty-rules { padding: 16px; border: 1px dashed var(--line-default); border-radius: var(--radius-md); color: var(--content-secondary); font-size: 0.82rem; line-height: 1.6; }
.secondary-btn,
.save-btn,
.icon-btn { flex-shrink: 0; min-height: 34px; padding: 7px 12px; border: 1px solid var(--line-default); border-radius: var(--radius-sm); background: var(--surface-panel); color: var(--content-primary); font: inherit; font-size: 0.8rem; cursor: pointer; }
.save-btn { border-color: var(--accent); background: var(--accent); color: var(--text-on-accent); }
.save-btn:disabled { opacity: 0.45; cursor: wait; }
.save-btn:hover:not(:disabled) { background: var(--accent-hover); }
.icon-btn { min-height: 28px; padding: 3px 8px; color: var(--content-muted); }
.secondary-btn:hover,
.icon-btn:hover { background: var(--surface-hover); }
.icon-btn.danger:hover { border-color: var(--color-danger); background: var(--color-danger-bg-subtle); color: var(--color-danger); }
.field-input:focus,
.rule-input:focus,
.rule-select:focus,
.ext-input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 600px) {
    .type-form { padding: 12px; }
    .form-header { gap: 8px; }
    .form-title-block h2 { font-size: 1rem; }
    .section-heading.with-action { flex-wrap: wrap; }
    .rule-row { padding: 12px; }
}
</style>
