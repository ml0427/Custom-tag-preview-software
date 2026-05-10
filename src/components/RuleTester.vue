<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { api, type TagRuleInput, type TagRuleTestHit } from '../api';

interface Rule {
  name?: string;
  matchType: string;
  pattern: string;
  tagName: string;
}

const props = defineProps<{
  rules: Rule[];
  placeholder?: string;
}>();

const testName = ref('');
const hits = ref<TagRuleTestHit[]>([]);
const isTesting = ref(false);
const testError = ref('');
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let requestSeq = 0;

const normalizeRules = (): TagRuleInput[] =>
  props.rules.map(rule => ({
    name: rule.name ?? '',
    matchType: rule.matchType,
    pattern: rule.pattern,
    tagName: rule.tagName,
  }));

watch(
  [testName, () => props.rules],
  () => {
    const seq = ++requestSeq;
    if (debounceTimer) clearTimeout(debounceTimer);
    const name = testName.value.trim();
    testError.value = '';
    if (!name) {
      hits.value = [];
      isTesting.value = false;
      return;
    }

    debounceTimer = setTimeout(async () => {
      isTesting.value = true;
      try {
        const nextHits = await api.testTagRules(name, normalizeRules());
        if (seq === requestSeq) hits.value = nextHits;
      } catch (e) {
        if (seq === requestSeq) {
          hits.value = [];
          testError.value = String(e);
        }
      } finally {
        if (seq === requestSeq) isTesting.value = false;
      }
    }, 150);
  },
  { deep: true }
);

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  requestSeq += 1;
});

const matchTypeLabel = (mt: string) => {
  switch (mt) {
    case 'prefix':        return '前綴';
    case 'suffix':        return '後綴';
    case 'contains':      return '包含';
    case 'regex':         return '正規';
    case 'regex_capture': return '正規擷取';
    default:              return mt;
  }
};
</script>

<template>
  <div class="rule-tester">
    <input
      v-model="testName"
      class="tester-input"
      :placeholder="placeholder ?? '輸入測試檔名…'"
    />
    <div v-if="!testName.trim()" class="tester-placeholder">
      輸入檔名後即時顯示哪些規則會命中
    </div>
    <div v-else-if="isTesting" class="tester-placeholder">
      測試中…
    </div>
    <div v-else-if="testError" class="hit-error">
      測試失敗：{{ testError }}
    </div>
    <div v-else-if="hits.length === 0" class="tester-empty">
      無規則命中
    </div>
    <ul v-else class="tester-hits">
      <li v-for="h in hits" :key="h.index" class="tester-hit">
        <span class="hit-mt">{{ matchTypeLabel(h.matchType) }}</span>
        <span class="hit-pattern">{{ h.pattern }}</span>
        <span class="hit-arrow">→</span>
        <span v-if="h.error" class="hit-error">正規錯誤：{{ h.error }}</span>
        <template v-else>
          <span v-for="t in h.tags" :key="t" class="hit-tag">{{ t }}</span>
        </template>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.rule-tester {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-overlay-soft);
  border: 1px dashed var(--border-default);
  border-radius: 8px;
  padding: 10px 12px;
}
.tester-input {
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.88rem;
  padding: 6px 10px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
}
.tester-input:focus { border-color: var(--accent); }
.tester-placeholder,
.tester-empty {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  padding: 2px 2px;
}
.tester-hits {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tester-hit {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 0.82rem;
  color: var(--text-primary);
}
.hit-mt {
  background: var(--bg-overlay-strong);
  color: var(--text-secondary);
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 0.72rem;
  flex-shrink: 0;
}
.hit-pattern {
  font-family: var(--font-mono);
  color: var(--text-secondary);
  font-size: 0.78rem;
  word-break: break-all;
}
.hit-arrow { color: var(--text-tertiary); flex-shrink: 0; }
.hit-tag {
  background: rgba(240, 178, 41, 0.12);
  border: 1px solid rgba(240, 178, 41, 0.3);
  color: var(--accent);
  border-radius: 4px;
  padding: 1px 7px;
  font-size: 0.78rem;
}
.hit-error { color: var(--color-danger); font-size: 0.78rem; }
</style>
