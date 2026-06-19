<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  api,
  type Item,
  type MetadataCandidate,
  type MetadataProviderInfo,
  type MetadataProviderMessage,
  type Tag,
} from '../api';
import { useToast } from '../composables/useToast';

const props = defineProps<{
  item: Item | null;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'applied'): void;
}>();

const { show: showToast } = useToast();

const providers = ref<MetadataProviderInfo[]>([]);
const selectedProviderIds = ref<string[]>([]);
const query = ref('');
const allowAdult = ref(false);
const isLoadingProviders = ref(false);
const isLookingUp = ref(false);
const isApplying = ref(false);
const candidates = ref<MetadataCandidate[]>([]);
const messages = ref<MetadataProviderMessage[]>([]);
const selectedCandidateId = ref('');
const selectedTags = ref<string[]>([]);

const archiveExtensionPattern = /\.(zip|cbz|rar|cbr|7z|cb7)$/i;
const urlPattern = /^https?:\/\//i;
const numericIdPattern = /^\d{4,}$/;

type MetadataQueryKind = 'empty' | 'url' | 'id' | 'search';

const candidateKey = (candidate: MetadataCandidate) =>
  `${candidate.providerId}:${candidate.id}:${candidate.sourceUrl}`;

const normalizeTag = (tag: string) => tag.trim();

const uniqueTags = (tags: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  tags.map(normalizeTag).filter(Boolean).forEach(tag => {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  });
  return result;
};

const defaultQueryFor = (item: Item) => {
  const fileName = item.name || item.path.split(/[\\/]/).pop() || '';
  return fileName.replace(archiveExtensionPattern, '').trim();
};

const metadataQueryKind = computed<MetadataQueryKind>(() => {
  const value = query.value.trim();
  if (!value) return 'empty';
  if (urlPattern.test(value)) return 'url';
  if (numericIdPattern.test(value)) return 'id';
  return 'search';
});

const providerSupportsQueryKind = (provider: MetadataProviderInfo, kind: MetadataQueryKind) => {
  if (kind === 'empty') return false;
  if (kind === 'url') return provider.supportsLookupByUrl;
  if (kind === 'id') return provider.supportsLookupById;
  return provider.supportsSearch;
};

const providerSupportsCurrentQuery = (provider: MetadataProviderInfo) =>
  providerSupportsQueryKind(provider, metadataQueryKind.value);

const providerUnsupportedReason = (provider: MetadataProviderInfo) => {
  if (providerSupportsCurrentQuery(provider)) return provider.displayName;
  if (metadataQueryKind.value === 'search') return `${provider.displayName} 不支援文字搜尋`;
  if (metadataQueryKind.value === 'url') return `${provider.displayName} 不支援網址查詢`;
  if (metadataQueryKind.value === 'id') return `${provider.displayName} 不支援 ID 查詢`;
  return '請先輸入查詢字串或作品網址';
};

const selectedProviders = computed(() =>
  providers.value.filter(provider => selectedProviderIds.value.includes(provider.id))
);

const lookupProviderIds = computed(() =>
  selectedProviders.value
    .filter(providerSupportsCurrentQuery)
    .map(provider => provider.id)
);

const selectedLookupProviders = computed(() =>
  providers.value.filter(provider => lookupProviderIds.value.includes(provider.id))
);

const unsupportedSelectedProviders = computed(() =>
  selectedProviders.value.filter(provider => !providerSupportsCurrentQuery(provider))
);

const selectedAdultProviders = computed(() =>
  selectedLookupProviders.value.filter(provider => provider.adult)
);

const existingTagNames = computed(() =>
  new Set((props.item?.tags ?? []).map(tag => tag.name.toLowerCase()))
);

const selectedCandidate = computed(() =>
  candidates.value.find(candidate => candidateKey(candidate) === selectedCandidateId.value) ?? null
);

const tagOptions = computed(() => {
  if (!selectedCandidate.value) return [];
  return uniqueTags([
    ...selectedCandidate.value.suggestedTags,
    ...selectedCandidate.value.rawTags,
  ]);
});

const selectedProviderLabel = computed(() => {
  if (!selectedProviderIds.value.length) return '尚未選擇來源';
  if (!selectedLookupProviders.value.length) return '目前查詢格式沒有可用來源';

  const label = selectedLookupProviders.value.map(provider => provider.displayName).join(', ');
  if (!unsupportedSelectedProviders.value.length) return label;

  const skipped = unsupportedSelectedProviders.value.map(provider => provider.displayName).join(', ');
  return `${label}（略過 ${skipped}）`;
});

const lookupBlockReason = computed(() => {
  if (!selectedProviderIds.value.length) return '請先選擇查詢來源';
  if (!query.value.trim()) return '請輸入查詢字串或作品網址';
  if (!lookupProviderIds.value.length) return '目前選擇的來源不支援這個查詢格式';
  if (selectedAdultProviders.value.length && !allowAdult.value) return '請先允許成人站台查詢';
  return '';
});

const canLookup = computed(() =>
  Boolean(props.item) && !isLookingUp.value && !isLoadingProviders.value && !lookupBlockReason.value
);

const loadProviders = async () => {
  isLoadingProviders.value = true;
  try {
    providers.value = await api.getMetadataProviders();
    selectedProviderIds.value = providers.value.map(provider => provider.id);
  } catch (error) {
    showToast('讀取 metadata 來源失敗: ' + String(error), 'error');
    providers.value = [];
    selectedProviderIds.value = [];
  } finally {
    isLoadingProviders.value = false;
  }
};

watch(() => props.visible, async (visible) => {
  if (!visible || !props.item) return;
  query.value = defaultQueryFor(props.item);
  allowAdult.value = false;
  candidates.value = [];
  messages.value = [];
  selectedCandidateId.value = '';
  selectedTags.value = [];
  await loadProviders();
});

watch(selectedCandidateId, () => {
  selectedTags.value = [];
});

const toggleProvider = (providerId: string) => {
  selectedProviderIds.value = selectedProviderIds.value.includes(providerId)
    ? selectedProviderIds.value.filter(id => id !== providerId)
    : [...selectedProviderIds.value, providerId];
};

const lookupMetadata = async () => {
  if (!props.item) return;
  if (!canLookup.value) {
    if (lookupBlockReason.value) showToast(lookupBlockReason.value, 'info');
    return;
  }

  isLookingUp.value = true;
  candidates.value = [];
  messages.value = [];
  selectedCandidateId.value = '';
  selectedTags.value = [];

  try {
    const response = await api.lookupMetadata({
      name: props.item.name,
      path: props.item.path,
      existingTags: props.item.tags.map(tag => tag.name),
      providerIds: lookupProviderIds.value,
      query: query.value.trim(),
      allowAdult: allowAdult.value,
      limit: 5,
    });
    candidates.value = response.candidates;
    messages.value = response.messages;
    selectedCandidateId.value = response.candidates[0]
      ? candidateKey(response.candidates[0])
      : '';
    if (!response.candidates.length) {
      showToast('沒有找到候選資料', 'info');
    }
  } catch (error) {
    showToast('metadata 查詢失敗: ' + String(error), 'error');
  } finally {
    isLookingUp.value = false;
  }
};

const selectCandidate = (candidate: MetadataCandidate) => {
  selectedCandidateId.value = candidateKey(candidate);
};

const toggleTag = (tag: string) => {
  selectedTags.value = selectedTags.value.includes(tag)
    ? selectedTags.value.filter(value => value !== tag)
    : [...selectedTags.value, tag];
};

const selectSuggestedTags = () => {
  if (!selectedCandidate.value) return;
  selectedTags.value = uniqueTags(selectedCandidate.value.suggestedTags);
};

const selectAllTags = () => {
  selectedTags.value = tagOptions.value;
};

const clearSelectedTags = () => {
  selectedTags.value = [];
};

const findExistingTag = async (name: string): Promise<Tag | null> => {
  const exactName = name.toLowerCase();
  const matches = await api.searchTags(name);
  return matches.find(tag => tag.name.toLowerCase() === exactName) ?? null;
};

const applySelectedTags = async () => {
  if (!props.item || isApplying.value) return;
  const tagsToApply = uniqueTags(selectedTags.value);
  if (!tagsToApply.length) {
    showToast('請先選擇要加入的標籤', 'info');
    return;
  }

  isApplying.value = true;
  let added = 0;
  let skipped = 0;

  try {
    for (const tagName of tagsToApply) {
      if (existingTagNames.value.has(tagName.toLowerCase())) {
        skipped += 1;
        continue;
      }
      const tag = await findExistingTag(tagName) ?? await api.createTag(tagName);
      await api.tagItem(props.item.id, tag.id);
      added += 1;
    }
    const suffix = skipped ? `，略過 ${skipped} 個既有標籤` : '';
    showToast(`已加入 ${added} 個標籤${suffix}`, 'success');
    emit('applied');
  } catch (error) {
    showToast('加入標籤失敗: ' + String(error), 'error');
  } finally {
    isApplying.value = false;
  }
};
</script>

<template>
  <teleport to="body">
    <div v-if="visible && item" class="metadata-overlay" @click.self="emit('close')">
      <section class="metadata-modal" role="dialog" aria-modal="true" aria-labelledby="metadata-title">
        <header class="metadata-header">
          <div class="title-stack">
            <p class="eyebrow">metadata lookup</p>
            <h2 id="metadata-title">Metadata 查詢標籤候選</h2>
            <p class="path-line">{{ item.path }}</p>
          </div>
          <button class="icon-close" type="button" title="關閉" @click="emit('close')">×</button>
        </header>

        <div class="lookup-toolbar">
          <label class="lookup-input">
            <span>查詢字串或網址</span>
            <input v-model="query" :disabled="isLookingUp" @keydown.enter="lookupMetadata" />
          </label>

          <div class="provider-panel">
            <span class="provider-title">來源</span>
            <div class="provider-list">
              <button
                v-for="provider in providers"
                :key="provider.id"
                type="button"
                class="provider-chip"
                :class="{
                  active: selectedProviderIds.includes(provider.id),
                  unsupported: !providerSupportsCurrentQuery(provider),
                }"
                :disabled="isLookingUp || isLoadingProviders"
                :title="providerUnsupportedReason(provider)"
                @click="toggleProvider(provider.id)"
              >
                {{ provider.displayName }}
                <span v-if="provider.adult" class="adult-badge">18+</span>
              </button>
            </div>
          </div>

          <label class="adult-toggle">
            <input v-model="allowAdult" type="checkbox" :disabled="isLookingUp" />
            <span>允許查詢成人站台</span>
          </label>

          <button class="lookup-btn" type="button" :disabled="!canLookup" @click="lookupMetadata">
            {{ isLookingUp ? '查詢中...' : '查詢' }}
          </button>
        </div>

        <div class="lookup-summary">
          <span>{{ selectedProviderLabel }}</span>
          <span v-if="lookupBlockReason" class="blocked-reason">{{ lookupBlockReason }}</span>
        </div>

        <div v-if="messages.length" class="message-list">
          <p
            v-for="message in messages"
            :key="`${message.providerId}:${message.message}`"
            class="message-line"
            :class="message.level"
          >
            {{ message.providerId }}: {{ message.message }}
          </p>
        </div>

        <div class="metadata-body">
          <aside class="candidate-list">
            <button
              v-for="candidate in candidates"
              :key="candidateKey(candidate)"
              type="button"
              class="candidate-row"
              :class="{ selected: candidateKey(candidate) === selectedCandidateId }"
              @click="selectCandidate(candidate)"
            >
              <span class="candidate-source">{{ candidate.providerName }}</span>
              <strong>{{ candidate.title }}</strong>
              <span class="candidate-meta">
                {{ candidate.imageCount ?? '-' }} 張 / {{ candidate.createdAt ?? '日期未知' }}
              </span>
            </button>
            <div v-if="!candidates.length" class="empty-state">
              {{ isLookingUp ? '正在查詢來源...' : '尚未查詢，或沒有找到候選資料。' }}
            </div>
          </aside>

          <main class="candidate-detail">
            <template v-if="selectedCandidate">
              <div class="detail-heading">
                <div>
                  <p class="eyebrow">{{ selectedCandidate.providerName }}</p>
                  <h3>{{ selectedCandidate.title }}</h3>
                  <a :href="selectedCandidate.sourceUrl" target="_blank" rel="noreferrer">
                    {{ selectedCandidate.sourceUrl }}
                  </a>
                </div>
                <div class="confidence-pill">{{ Math.round(selectedCandidate.confidence * 100) }}%</div>
              </div>

              <div v-if="selectedCandidate.warnings.length" class="warning-box">
                <p v-for="warning in selectedCandidate.warnings" :key="warning">{{ warning }}</p>
              </div>

              <div v-if="selectedCandidate.tagGroups.length" class="tag-groups">
                <div v-for="group in selectedCandidate.tagGroups" :key="group.key" class="tag-group">
                  <span class="tag-group-label">{{ group.label }}</span>
                  <span class="tag-group-values">{{ group.tags.join(', ') }}</span>
                </div>
              </div>

              <div class="tag-controls">
                <button type="button" @click="selectSuggestedTags">選建議</button>
                <button type="button" @click="selectAllTags">全選</button>
                <button type="button" @click="clearSelectedTags">清除</button>
              </div>

              <div class="tag-picker">
                <button
                  v-for="tag in tagOptions"
                  :key="tag"
                  type="button"
                  class="tag-option"
                  :class="{
                    selected: selectedTags.includes(tag),
                    existing: existingTagNames.has(tag.toLowerCase()),
                  }"
                  @click="toggleTag(tag)"
                >
                  {{ tag }}
                  <span v-if="existingTagNames.has(tag.toLowerCase())">已存在</span>
                </button>
              </div>
            </template>

            <div v-else class="empty-detail">
              選擇一筆候選資料後，再挑要加入的標籤。
            </div>
          </main>
        </div>

        <footer class="metadata-footer">
          <span>{{ selectedTags.length }} 個標籤待加入</span>
          <div class="footer-actions">
            <button type="button" class="secondary-btn" @click="emit('close')">取消</button>
            <button type="button" class="primary-btn" :disabled="isApplying" @click="applySelectedTags">
              {{ isApplying ? '加入中...' : '加入選取標籤' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </teleport>
</template>

<style scoped>
.metadata-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-scrim-heavy);
}

.metadata-modal {
  width: min(1080px, 100%);
  max-height: min(860px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-panel);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: var(--shadow-modal);
}

.metadata-header,
.metadata-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-default);
}

.metadata-footer {
  border-top: 1px solid var(--border-default);
  border-bottom: 0;
  color: var(--text-secondary);
}

.title-stack {
  min-width: 0;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--text-tertiary);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h2,
h3 {
  margin: 0;
  line-height: 1.25;
  letter-spacing: 0;
}

.path-line {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 0.82rem;
  word-break: break-all;
}

.icon-close {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid var(--border-default);
  border-radius: 50%;
  background: var(--bg-overlay-soft);
  color: var(--text-primary);
  font-size: 1.2rem;
  cursor: pointer;
}

.lookup-toolbar {
  display: grid;
  grid-template-columns: minmax(180px, 1.2fr) minmax(220px, 1fr) auto auto;
  gap: 12px;
  align-items: end;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default);
}

.lookup-input,
.adult-toggle,
.provider-panel {
  min-width: 0;
}

.lookup-input,
.provider-panel {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.lookup-input span,
.provider-title {
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.lookup-input input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-primary);
  padding: 9px 10px;
  outline: none;
}

.lookup-input input:focus {
  border-color: var(--accent);
}

.provider-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.provider-chip,
.tag-option,
.tag-controls button,
.secondary-btn,
.primary-btn,
.lookup-btn {
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.provider-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border-default);
  background: var(--bg-overlay-soft);
  color: var(--text-primary);
  padding: 7px 10px;
}

.provider-chip.active {
  border-color: var(--accent);
  background: var(--bg-overlay-strong);
}

.provider-chip.unsupported {
  opacity: 0.58;
}

.provider-chip:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.adult-badge {
  color: var(--color-danger);
  font-size: 0.72rem;
}

.adult-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.lookup-btn,
.primary-btn {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--text-on-accent);
  padding: 10px 16px;
}

.lookup-btn:disabled,
.primary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.lookup-summary,
.message-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.blocked-reason,
.message-line.warning {
  color: var(--color-warning, #d18b00);
}

.message-line.error {
  color: var(--color-danger);
}

.message-line {
  margin: 0;
}

.metadata-body {
  min-height: 360px;
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
  overflow: hidden;
}

.candidate-list {
  min-width: 0;
  overflow: auto;
  padding: 14px;
  border-right: 1px solid var(--border-default);
}

.candidate-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  margin-bottom: 8px;
  padding: 11px 12px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.candidate-row.selected {
  border-color: var(--accent);
  background: var(--bg-overlay-soft);
}

.candidate-source,
.candidate-meta {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.candidate-row strong {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.empty-state,
.empty-detail {
  color: var(--text-tertiary);
  padding: 24px 12px;
  line-height: 1.5;
}

.candidate-detail {
  min-width: 0;
  overflow: auto;
  padding: 18px 20px 24px;
}

.detail-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.detail-heading a {
  display: inline-block;
  max-width: 100%;
  margin-top: 7px;
  color: var(--accent);
  overflow-wrap: anywhere;
  font-size: 0.82rem;
}

.confidence-pill {
  flex: 0 0 auto;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  padding: 5px 9px;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.warning-box {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid var(--color-danger);
  border-radius: 8px;
  color: var(--color-danger);
  background: var(--color-danger-bg-subtle);
}

.warning-box p {
  margin: 0;
}

.tag-groups {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}

.tag-group {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 10px;
  color: var(--text-secondary);
  font-size: 0.86rem;
}

.tag-group-label {
  color: var(--text-tertiary);
}

.tag-group-values {
  overflow-wrap: anywhere;
}

.tag-controls,
.footer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-controls {
  margin-bottom: 12px;
}

.tag-controls button,
.secondary-btn {
  border: 1px solid var(--border-default);
  background: var(--bg-overlay-soft);
  color: var(--text-primary);
  padding: 8px 11px;
}

.tag-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-primary);
  padding: 8px 10px;
  overflow-wrap: anywhere;
}

.tag-option.selected {
  border-color: var(--accent);
  background: var(--bg-overlay-strong);
}

.tag-option.existing {
  color: var(--text-secondary);
}

.tag-option span {
  color: var(--text-tertiary);
  font-size: 0.72rem;
}

@media (max-width: 860px) {
  .metadata-overlay {
    padding: 10px;
  }

  .metadata-modal {
    max-height: calc(100vh - 20px);
  }

  .lookup-toolbar {
    grid-template-columns: 1fr;
  }

  .metadata-body {
    grid-template-columns: 1fr;
  }

  .candidate-list {
    max-height: 220px;
    border-right: 0;
    border-bottom: 1px solid var(--border-default);
  }

  .metadata-header,
  .metadata-footer {
    align-items: flex-start;
  }

  .metadata-footer {
    flex-direction: column;
  }
}
</style>
