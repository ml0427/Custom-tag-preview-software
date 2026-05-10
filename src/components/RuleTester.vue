<script setup lang="ts">
import { ref, computed } from 'vue';

interface Rule {
  matchType: string;
  pattern: string;
  tagName: string;
}

const props = defineProps<{
  rules: Rule[];
  placeholder?: string;
}>();

const testName = ref('');

interface Hit {
  index: number;
  rule: Rule;
  tags: string[];
  error?: string;
}

// 規則命中邏輯需與後端 commands/rules.rs::compute_proposed_tags 保持一致
const hits = computed<Hit[]>(() => {
  const name = testName.value.trim();
  if (!name) return [];

  const out: Hit[] = [];
  props.rules.forEach((rule, idx) => {
    if (!rule.pattern) return;

    if (rule.matchType === 'regex_capture') {
      try {
        const re = new RegExp(rule.pattern);
        const m = name.match(re);
        if (m && m[1]) {
          const tags = m[1]
            .split(/[,()（）、]/)
            .map(s => s.trim())
            .filter(Boolean);
          if (tags.length > 0) out.push({ index: idx, rule, tags });
        }
      } catch (e) {
        out.push({ index: idx, rule, tags: [], error: String(e) });
      }
      return;
    }

    if (!rule.tagName) return;

    let matched = false;
    try {
      switch (rule.matchType) {
        case 'prefix':   matched = name.startsWith(rule.pattern); break;
        case 'suffix':   matched = name.endsWith(rule.pattern); break;
        case 'contains': matched = name.includes(rule.pattern); break;
        case 'regex':    matched = new RegExp(rule.pattern).test(name); break;
      }
    } catch (e) {
      out.push({ index: idx, rule, tags: [], error: String(e) });
      return;
    }
    if (matched) out.push({ index: idx, rule, tags: [rule.tagName] });
  });
  return out;
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
    <div v-else-if="hits.length === 0" class="tester-empty">
      無規則命中
    </div>
    <ul v-else class="tester-hits">
      <li v-for="h in hits" :key="h.index" class="tester-hit">
        <span class="hit-mt">{{ matchTypeLabel(h.rule.matchType) }}</span>
        <span class="hit-pattern">{{ h.rule.pattern }}</span>
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
