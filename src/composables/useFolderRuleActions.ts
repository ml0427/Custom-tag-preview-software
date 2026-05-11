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
    let dbItem = itemByPath().get(pathKey(target.path));

    // 沒在 itemByPath（例如從 SourcePanel 觸發、或路徑不在當前 source 範圍內）
    // 就先把該路徑帶入 DB，才能對它套規則。quickImport 不會遞迴掃內容物。
    if (!dbItem) {
      try {
        dbItem = await api.quickImportItem(target.path);
      } catch (e) {
        showToast('匯入失敗: ' + String(e), 'error');
        return;
      }
    }

    const category = target.category ?? dbItem.category ?? 'default';
    const type = itemTypes().find(t => t.name === category);
    if (!type?.tagRules?.length) {
      showToast('此類別沒有設定掃描規則', 'info');
      return;
    }

    try {
      // 「重新套用規則」語意：只對該 item 自己跑規則，不遞迴、不碰子層、不掃 FS。
      // 想對整個目錄樹批次掃描請走「掃描精靈」（applyTagScan）。
      const result = await api.applyRulesToItem(dbItem.id, type.tagRules);
      showToast(`已套用 ${result.tagged} 個標籤`, 'success');
      await onApplied?.();
    } catch (e) {
      showToast('套用失敗: ' + String(e), 'error');
    }
  };

  const applyRulesForItem = async (item: FileItem) => {
    const category = itemByPath().get(pathKey(item.path))?.category ?? undefined;
    return applyRulesForTarget({ path: item.path, category });
  };

  return { applyRulesForTarget, applyRulesForItem };
}
