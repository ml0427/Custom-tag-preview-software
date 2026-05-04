import { ref } from 'vue';
import { api, type Item } from '../api';
import { useToast } from './useToast';

export interface DuplicateGroup { fingerprint: string; items: Item[] }

export function useDuplicateScanner() {
  const { show: showToast, confirm: confirmDialog } = useToast();
  const groups = ref<DuplicateGroup[]>([]);
  const isLoading = ref(false);
  const isComputing = ref(false);
  const progress = ref({ current: 0, total: 0 });

  const loadGroups = async () => {
    isLoading.value = true;
    try {
      groups.value = await api.getDuplicateGroups();
    } catch (e) {
      showToast('載入失敗: ' + String(e), 'error');
    } finally {
      isLoading.value = false;
    }
  };

  const runCompute = async () => {
    isComputing.value = true;
    progress.value = { current: 0, total: 0 };
    try {
      const count = await api.computeFingerprints();
      showToast(`已計算 ${count} 個項目的指紋`, 'success');
      await loadGroups();
    } catch (e) {
      showToast('計算失敗: ' + String(e), 'error');
    } finally {
      isComputing.value = false;
    }
  };

  const trashItemInGroup = async (item: Item, gi: number) => {
    if (!await confirmDialog(`確定將「${item.name}」移至資源回收筒？`)) return false;
    try {
      await api.trashItem(item.path);
      groups.value[gi].items = groups.value[gi].items.filter(i => i.id !== item.id);
      if (groups.value[gi].items.length < 2) groups.value.splice(gi, 1);
      showToast('已移至資源回收筒', 'success');
      return true;
    } catch (e) {
      showToast('刪除失敗: ' + String(e), 'error');
      return false;
    }
  };

  const keepNewestInGroup = async (gi: number) => {
    const group = groups.value[gi];
    const toDelete = group.items.slice(0, -1);
    if (!await confirmDialog(`將保留最新版本，刪除另外 ${toDelete.length} 個重複項目？`)) return;
    for (const item of toDelete) {
      try {
        await api.trashItem(item.path);
      } catch { /* continue */ }
    }
    groups.value.splice(gi, 1);
    showToast(`已刪除 ${toDelete.length} 個重複項目`, 'success');
  };

  return {
    groups,
    isLoading,
    isComputing,
    progress,
    loadGroups,
    runCompute,
    trashItemInGroup,
    keepNewestInGroup,
  };
}
