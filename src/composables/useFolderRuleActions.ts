import { api, type FileItem, type Item, type ItemType } from '../api';
import { pathKey } from '../utils/pathKey';

type ToastType = 'success' | 'error' | 'info';
type RuleTarget = {
  path: string;
  category?: string | null;
};

export function useFolderRuleActions(
  itemByPath: () => Map<string, Item>,
  itemTypes: () => ItemType[],
  showToast: (message: string, type?: ToastType) => void,
  hideContextMenu: () => void,
  onApplied?: () => void | Promise<void>
) {
  const applyRulesForTarget = async (target: RuleTarget) => {
    hideContextMenu();
    const dbItem = itemByPath().get(pathKey(target.path));
    const category = target.category ?? dbItem?.category ?? 'default';

    const type = itemTypes().find(t => t.name === category);
    if (!type?.tagRules?.length) {
      showToast('此類別沒有設定掃描規則', 'info');
      return;
    }

    try {
      const result = await api.applyTagScan(target.path, type.tagRules);
      showToast(`已套用 ${result.tagged} 個標籤`, 'success');
      await onApplied?.();
    } catch (e) {
      showToast('套用失敗: ' + String(e), 'error');
    }
  };

  const applyRulesForItem = async (item: FileItem) => {
    let category = itemByPath().get(pathKey(item.path))?.category ?? undefined;
    if (!category) {
      try {
        const folders = await api.getFolders();
        const norm = item.path.replace(/\\/g, '/');
        const best = folders
          .filter(f => {
            const fp = f.path.replace(/\\/g, '/');
            return norm === fp || norm.startsWith(fp.endsWith('/') ? fp : fp + '/');
          })
          .sort((a, b) => b.path.length - a.path.length)[0];
        category = best?.category ?? undefined;
      } catch { /* ignore */ }
    }
    return applyRulesForTarget({ path: item.path, category });
  };

  return { applyRulesForTarget, applyRulesForItem };
}
