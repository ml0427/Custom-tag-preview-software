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
  hideContextMenu: () => void
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
    } catch (e) {
      showToast('套用失敗: ' + String(e), 'error');
    }
  };

  const applyRulesForItem = (item: FileItem) => applyRulesForTarget({
    path: item.path,
    category: itemByPath().get(pathKey(item.path))?.category,
  });

  return { applyRulesForTarget, applyRulesForItem };
}
