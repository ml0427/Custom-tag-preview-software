import { ref, computed, watch } from 'vue';
import { api, type Tag } from '../api';
import { useToast } from './useToast';

const STORAGE_KEY = 'ctp_hide_empty_tags';

export function useTags() {
  const { show: showToast } = useToast();
  const tags = ref<Tag[]>([]);
  const tagCounts = ref<Map<number, number>>(new Map());
  const searchQuery = ref('');
  const isLoading = ref(false);

  // 從 localStorage 讀取偏好，預設關閉
  const hideEmptyTags = ref(localStorage.getItem(STORAGE_KEY) === 'true');

  watch(hideEmptyTags, (val) => {
    localStorage.setItem(STORAGE_KEY, String(val));
  });

  const loadTags = async () => {
    isLoading.value = true;
    try {
      const [tagList, counts] = await Promise.all([api.getTags(), api.getTagCounts()]);
      tags.value = tagList;
      tagCounts.value = new Map(counts.map(c => [c.id, c.count]));
    } catch {
      showToast('載入標籤失敗', 'error');
    } finally {
      isLoading.value = false;
    }
  };

  const filteredTags = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    let result = tags.value;
    if (q) result = result.filter(t => t.name.toLowerCase().includes(q));
    if (hideEmptyTags.value) result = result.filter(t => (tagCounts.value.get(t.id) ?? 0) > 0);
    return result;
  });

  const createTag = async (name: string) => {
    try {
      await api.createTag(name);
      await loadTags();
    } catch {
      showToast('建立標籤失敗', 'error');
    }
  };

  const renameTag = async (id: number, name: string) => {
    try {
      await api.renameTag(id, name);
      await loadTags();
    } catch {
      showToast('重新命名失敗', 'error');
    }
  };

  const deleteTag = async (id: number) => {
    try {
      await api.deleteTag(id);
      await loadTags();
    } catch {
      showToast('刪除標籤失敗', 'error');
    }
  };

  const setTagColor = async (id: number, color: string | null) => {
    try {
      const updated = await api.setTagColor(id, color);
      const idx = tags.value.findIndex(t => t.id === id);
      if (idx !== -1) tags.value[idx] = updated;
    } catch {
      showToast('設定顏色失敗', 'error');
    }
  };

  return {
    tags,
    tagCounts,
    searchQuery,
    isLoading,
    filteredTags,
    loadTags,
    hideEmptyTags,
    createTag,
    renameTag,
    deleteTag,
    setTagColor,
  };
}
