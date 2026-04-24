<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, type Source, type TagRuleInput, type ScanPreviewItem } from '../api';
import { useToast } from '../composables/useToast';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'completed'): void;
}>();

const { show: showToast } = useToast();
const step = ref<1 | 2 | 3>(1);
const sources = ref<Source[]>([]);
const selectedPath = ref<string>('');
const rules = ref<TagRuleInput[]>([]);
const previewItems = ref<ScanPreviewItem[]>([]);
const isLoading = ref(false);
const errorMsg = ref('');

const MATCH_TYPES = [
  { value: 'prefix',        label: '前綴' },
  { value: 'suffix',        label: '後綴' },
  { value: 'contains',      label: '包含' },
  { value: 'regex',         label: '正則比對' },
  { value: 'regex_capture', label: '正則擷取' },
];

watch(() => props.visible, async (v) => {
  if (!v) return;
  step.value = 1;
  errorMsg.value = '';
  previewItems.value = [];
  try {
    const [srcs, savedRules] = await Promise.all([api.getSources(), api.getTagRules()]);
    sources.value = srcs;
    selectedPath.value = srcs[0]?.path ?? '';
    rules.value = savedRules.length > 0
      ? savedRules.map(r => ({ name: r.name, matchType: r.matchType, pattern: r.pattern, tagName: r.tagName }))
      : [{ name: '', matchType: 'prefix', pattern: '', tagName: '' }];
  } catch (e) {
    errorMsg.value = String(e);
  }
});

const addRule = () => {
  rules.value.push({ name: '', matchType: 'prefix', pattern: '', tagName: '' });
};

const removeRule = (i: number) => {
  rules.value.splice(i, 1);
};

const goToPreview = async () => {
  if (!selectedPath.value) { errorMsg.value = '請先選擇來源目錄'; return; }
  errorMsg.value = '';
  isLoading.value = true;
  step.value = 3;
  try {
    const validRules = rules.value.filter(r => r.pattern && (r.matchType === 'regex_capture' || r.tagName));
    previewItems.value = await api.previewTagScan(selectedPath.value, validRules);
  } catch (e) {
    errorMsg.value = String(e);
  } finally {
    isLoading.value = false;
  }
};

const applyAndClose = async () => {
  isLoading.value = true;
  errorMsg.value = '';
  try {
    const validRules = rules.value.filter(r => r.pattern && (r.matchType === 'regex_capture' || r.tagName));
    await api.saveTagRules(validRules);
    const result = await api.applyTagScan(selectedPath.value, validRules);
    showToast(`完成！新增 ${result.added}、更新 ${result.updated}、移除 ${result.removed}，標籤套用 ${result.tagged} 次`, 'success', 5000);
    emit('completed');
    emit('close');
  } catch (e) {
    errorMsg.value = String(e);
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @click.self="emit('close')">
      <div class="wizard-card">

        <!-- Header -->
        <div class="wizard-header">
          <div class="step-bar">
            <span :class="['step-dot', { active: step >= 1 }]">1</span>
            <span class="step-line"></span>
            <span :class="['step-dot', { active: step >= 2 }]">2</span>
            <span class="step-line"></span>
            <span :class="['step-dot', { active: step >= 3 }]">3</span>
          </div>
          <button class="close-btn" @click="emit('close')">✕</button>
        </div>

        <!-- Step 1: 選來源 -->
        <div v-if="step === 1" class="step-body">
          <h2>選擇掃描目錄</h2>
          <p class="sub">從已登記的來源中選一個</p>
          <div v-if="sources.length === 0" class="empty-hint">尚未新增任何來源目錄</div>
          <div class="source-list">
            <label
              v-for="s in sources"
              :key="s.id"
              :class="['source-item', { selected: selectedPath === s.path }]"
              @click="selectedPath = s.path"
            >
              <span class="source-radio">{{ selectedPath === s.path ? '◉' : '○' }}</span>
              <span class="source-path">{{ s.path }}</span>
            </label>
          </div>
          <div v-if="errorMsg" class="error">{{ errorMsg }}</div>
          <div class="footer-btns">
            <button class="btn-ghost" @click="emit('close')">取消</button>
            <button class="btn-primary" :disabled="!selectedPath" @click="step = 2">下一步 →</button>
          </div>
        </div>

        <!-- Step 2: 規則編輯器 -->
        <div v-else-if="step === 2" class="step-body">
          <h2>設定標籤規則</h2>
          <p class="sub">符合條件的項目，掃描後自動打標籤</p>

          <div class="rules-table">
            <div class="rules-header">
              <span style="flex:2">說明</span>
              <span style="flex:1.5">比對方式</span>
              <span style="flex:2">比對字串</span>
              <span style="flex:2">套用標籤</span>
              <span style="width:32px"></span>
            </div>
            <div v-for="(rule, i) in rules" :key="i" class="rule-row">
              <input v-model="rule.name" placeholder="（選填）" class="rule-input" style="flex:2" />
              <select v-model="rule.matchType" class="rule-select" style="flex:1.5">
                <option v-for="t in MATCH_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
              <input v-model="rule.pattern" placeholder="輸入字串或正則" class="rule-input" style="flex:2" />
              <input
                v-if="rule.matchType !== 'regex_capture'"
                v-model="rule.tagName"
                placeholder="標籤名稱"
                class="rule-input"
                style="flex:2"
              />
              <span v-else class="capture-hint" style="flex:2">← 自動取括號內文字</span>
              <button class="btn-del" @click="removeRule(i)">✕</button>
            </div>
          </div>

          <button class="btn-add-rule" @click="addRule">＋ 新增規則</button>
          <div v-if="errorMsg" class="error">{{ errorMsg }}</div>
          <div class="footer-btns">
            <button class="btn-ghost" @click="step = 1">← 上一步</button>
            <button class="btn-primary" @click="goToPreview">預覽結果 →</button>
          </div>
        </div>

        <!-- Step 3: 預覽 -->
        <div v-else-if="step === 3" class="step-body">
          <h2>預覽結果</h2>
          <p class="sub">以下項目將被套用標籤（共 {{ previewItems.length }} 項）</p>

          <div v-if="isLoading" class="loading-hint">掃描中...</div>
          <div v-else-if="previewItems.length === 0 && !errorMsg" class="empty-hint">沒有項目符合規則</div>
          <div v-else class="preview-list">
            <div v-for="item in previewItems" :key="item.path" class="preview-row">
              <span class="item-icon">{{ item.isDir ? '📁' : '📄' }}</span>
              <span class="item-name" :title="item.path">{{ item.name }}</span>
              <div class="tag-chips">
                <span v-for="tag in item.proposedTags" :key="tag" class="mini-tag">{{ tag }}</span>
              </div>
            </div>
          </div>

          <div v-if="errorMsg" class="error">{{ errorMsg }}</div>
          <div class="footer-btns">
            <button class="btn-ghost" :disabled="isLoading" @click="step = 2">← 上一步</button>
            <button class="btn-confirm" :disabled="isLoading || previewItems.length === 0" @click="applyAndClose">
              {{ isLoading ? '處理中...' : '確認存入' }}
            </button>
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.wizard-card {
  background: #1a1f2e;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  width: 680px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0,0,0,0.5);
}

.wizard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.step-bar { display: flex; align-items: center; gap: 0; }

.step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.2s;
}
.step-dot.active { background: var(--accent-color); color: #fff; }

.step-line {
  width: 40px;
  height: 2px;
  background: rgba(255,255,255,0.1);
  margin: 0 4px;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.close-btn:hover { background: rgba(255,255,255,0.08); }

.step-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

h2 { font-size: 1.2rem; color: var(--text-primary); margin: 0; }
.sub { font-size: 0.9rem; color: var(--text-secondary); margin: 0; }

/* Source list */
.source-list { display: flex; flex-direction: column; gap: 8px; }
.source-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  cursor: pointer;
  transition: all 0.2s;
}
.source-item:hover { border-color: var(--accent-color); background: rgba(139,92,246,0.05); }
.source-item.selected { border-color: var(--accent-color); background: var(--accent-color-transparent); }
.source-radio { font-size: 1.1rem; color: var(--accent-color); }
.source-path { font-family: monospace; font-size: 0.9rem; color: var(--text-primary); word-break: break-all; }

/* Rules table */
.rules-table { display: flex; flex-direction: column; gap: 6px; }
.rules-header {
  display: flex;
  gap: 8px;
  padding: 0 8px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  text-transform: uppercase;
}
.rule-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  padding: 8px;
}
.rule-input {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.88rem;
  padding: 6px 10px;
  outline: none;
  min-width: 0;
}
.rule-input:focus { border-color: var(--accent-color); }
.rule-select {
  background-color: rgba(30, 35, 50, 0.95);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237d8590'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  -webkit-appearance: none;
  appearance: none;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.88rem;
  padding: 6px 28px 6px 8px;
  outline: none;
  min-width: 0;
  cursor: pointer;
}
.rule-select:focus { border-color: var(--accent-color); }
.rule-select option {
  background: #1a1f2e;
  color: var(--text-primary);
}
.capture-hint {
  font-size: 0.82rem;
  color: var(--accent-color);
  opacity: 0.8;
  display: flex;
  align-items: center;
  padding: 0 4px;
}

.btn-del {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  font-size: 0.8rem;
}
.btn-del:hover { background: rgba(255,80,80,0.15); color: #ff6060; }

.btn-add-rule {
  align-self: flex-start;
  background: none;
  border: 1px dashed rgba(255,255,255,0.2);
  border-radius: 8px;
  color: var(--text-secondary);
  padding: 8px 16px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}
.btn-add-rule:hover { border-color: var(--accent-color); color: var(--accent-color); }

/* Preview */
.preview-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  background: rgba(0,0,0,0.15);
}
.preview-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.preview-row:last-child { border-bottom: none; }
.item-icon { flex-shrink: 0; }
.item-name {
  flex: 1;
  font-size: 0.9rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-chips { display: flex; flex-wrap: wrap; gap: 4px; flex-shrink: 0; }
.mini-tag {
  background: var(--accent-color-transparent);
  color: var(--accent-color);
  border: 1px solid rgba(139,92,246,0.3);
  padding: 2px 8px;
  border-radius: 100px;
  font-size: 0.78rem;
}

/* Misc */
.loading-hint, .empty-hint {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px;
  font-size: 0.9rem;
}
.error { color: #ff6060; font-size: 0.88rem; }

.footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: auto;
  padding-top: 8px;
}
.btn-ghost {
  background: none;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  color: var(--text-secondary);
  padding: 10px 20px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-ghost:hover:not(:disabled) { border-color: var(--text-primary); color: var(--text-primary); }
.btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary {
  background: var(--accent-color);
  border: none;
  border-radius: 8px;
  color: #fff;
  padding: 10px 24px;
  cursor: pointer;
  font-weight: 600;
  transition: opacity 0.2s;
}
.btn-primary:hover:not(:disabled) { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-confirm {
  background: #22c55e;
  border: none;
  border-radius: 8px;
  color: #fff;
  padding: 10px 24px;
  cursor: pointer;
  font-weight: 600;
  transition: opacity 0.2s;
}
.btn-confirm:hover:not(:disabled) { opacity: 0.85; }
.btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }

.step-body::-webkit-scrollbar { width: 4px; }
.step-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
.preview-list::-webkit-scrollbar { width: 4px; }
.preview-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>
