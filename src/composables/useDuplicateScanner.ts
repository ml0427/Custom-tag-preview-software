import { ref } from 'vue';
import { api, type DuplicateGroup, type DuplicateItem } from '../api';
import { useToast } from './useToast';

export type { DuplicateGroup, DuplicateItem };

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

  const trashItemInGroup = async (item: DuplicateItem, gi: number) => {
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

  /// 對「疑似已移動」群組：清理 DB 內已不存在的失效紀錄
  const cleanupMovedInGroup = async (gi: number) => {
    const group = groups.value[gi];
    const missing = group.items.filter(i => !i.pathExists);
    if (missing.length === 0) return;
    if (!await confirmDialog(`此群組有 ${missing.length} 筆檔案已不存在，是否清理對應的 DB 紀錄？`)) return;
    for (const item of missing) {
      try { await api.untrackItem(item.path); } catch { /* continue */ }
    }
    await loadGroups();
    showToast(`已清理 ${missing.length} 筆失效紀錄`, 'success');
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
    cleanupMovedInGroup,
  };
}
