import { api, type FileItem, type Item, type ItemType } from '../api';
import { pathKey } from '../utils/pathKey';

type ToastType = 'success' | 'error' | 'info';

export function useFolderRuleActions(
  itemByPath: () => Map<string, Item>,
  itemTypes: () => ItemType[],
  showToast: (message: string, type?: ToastType) => void,
  hideContextMenu: () => void
) {
  const applyRulesForFolder = async (item: FileItem) => {
    hideContextMenu();
    const dbItem = itemByPath().get(pathKey(item.path));
    if (!dbItem) return;

    const type = itemTypes().find(t => t.name === (dbItem.category ?? 'default'));
    if (!type?.tagRules?.length) {
      showToast('此類別沒有設定掃描規則', 'info');
      return;
    }

    try {
      const result = await api.applyTagScan(item.path, type.tagRules);
      showToast(`已套用 ${result.tagged} 個標籤`, 'success');
    } catch (e) {
      showToast('套用失敗: ' + String(e), 'error');
    }
  };

  return { applyRulesForFolder };
}
