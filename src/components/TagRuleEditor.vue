<script setup lang="ts">
import { type TagRuleInput } from '../api';

defineProps<{
  rules: TagRuleInput[];
  matchTypes: { value: string; label: string }[];
}>();

const emit = defineEmits<{
  (e: 'add'): void;
  (e: 'remove', index: number): void;
}>();
</script>

<template>
  <div class="rules-table">
    <div class="rules-header">
      <span>說明</span>
      <span>比對方式</span>
      <span>比對字串</span>
      <span>套用標籤</span>
      <span class="rule-del-spacer"></span>
    </div>
    <div v-for="(rule, i) in rules" :key="i" class="rule-row">
      <input v-model="rule.name" placeholder="（選填）" class="rule-input" />
      <select v-model="rule.matchType" class="rule-select">
        <option v-for="t in matchTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
      <input v-model="rule.pattern" placeholder="輸入字串或正則" class="rule-input" />
      <input
        v-if="rule.matchType !== 'regex_capture'"
        v-model="rule.tagName"
        placeholder="標籤名稱"
        class="rule-input"
      />
      <span v-else class="capture-hint">← 自動取括號內文字</span>
      <button class="btn-del" @click="emit('remove', i)">✕</button>
    </div>
    <button class="btn-add-rule" @click="emit('add')">＋ 新增規則</button>
  </div>
</template>

<style scoped>
.rules-table { display: flex; flex-direction: column; gap: 6px; }
.rules-header,
.rule-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr 2fr 2fr 32px;
  gap: 8px;
  align-items: center;
}
.rules-header {
  padding: 0 8px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  text-transform: uppercase;
}
.rule-row {
  background: var(--bg-overlay-soft);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 8px;
}
.rule-input {
  width: 100%;
  background: var(--bg-overlay-soft);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.88rem;
  padding: 6px 10px;
  outline: none;
  min-width: 0;
}
.rule-input:focus { border-color: var(--accent); }
.rule-select {
  width: 100%;
  background-color: var(--bg-elevated);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237d8590'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  -webkit-appearance: none;
  appearance: none;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.88rem;
  padding: 6px 28px 6px 8px;
  outline: none;
  min-width: 0;
  cursor: pointer;
}
.rule-select:focus { border-color: var(--accent); }
.rule-select option {
  background: var(--bg-elevated);
  color: var(--text-primary);
}
.capture-hint {
  font-size: 0.82rem;
  color: var(--accent);
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
.btn-del:hover { background: var(--color-danger-bg-subtle); color: var(--color-danger); }

.btn-add-rule {
  align-self: flex-start;
  background: none;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  color: var(--text-secondary);
  padding: 8px 16px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  margin-top: 4px;
}
.btn-add-rule:hover { border-color: var(--accent); color: var(--accent); }
</style>
