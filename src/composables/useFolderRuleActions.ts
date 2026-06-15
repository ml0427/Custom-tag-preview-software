import { api, type FileItem, type Item, type ItemType } from '../api';
import { pathKey } from '../utils/pathKey';

type ToastType = 'success' | 'error' | 'info';
type RuleTarget = {
  path: string;
  category?: string | null;
  presetTypeId?: number | null;
};

export function useFolderRuleActions(
  itemByPath: (() => Map<string, Item>) | undefined,
  itemTypes: () => ItemType[],
  showToast: (message: string, type?: ToastType) => void,
  hideContextMenu: () => void,
  onApplied?: () => void | Promise<void>
) {
  const applyRulesForTarget = async (target: RuleTarget) => {
    hideContextMenu();
    let dbItem = itemByPath?.().get(pathKey(target.path));

    if (!dbItem) {
      try {
        dbItem = await api.quickImportItem(target.path);
      } catch (e) {
        showToast('匯入失敗: ' + String(e), 'error');
        return;
      }
    }

    const types = itemTypes();
    let type = target.presetTypeId != null
      ? types.find(t => t.id === target.presetTypeId)
      : undefined;

    if (!type && dbItem.itemType === 'folder') {
      const preset = await api.getFolderRulePreset(dbItem.id);
      if (preset) type = types.find(t => t.id === preset.presetTypeId);
    }

    if (!type && dbItem.itemType !== 'folder') {
      const presetName = target.category ?? dbItem.category ?? 'default';
      type = types.find(t => t.name === presetName);
    }

    if (!type?.tagRules?.length) {
      showToast(dbItem.itemType === 'folder' ? '此資料夾尚未設定預設標籤規則集' : '此項目沒有可套用的標籤規則集', 'info');
      return;
    }

    try {
      // 「套用標籤規則集」語意：只對該 item 自己跑目前規則，不遞迴、不碰子層、不掃 FS。
      // 想對整個目錄樹批次掃描請走「掃描精靈」（applyTagScan）。
      const result = await api.applyRulesToItem(dbItem.id, type.tagRules);
      showToast(`已套用 ${result.tagged} 個標籤`, 'success');
      await onApplied?.();
    } catch (e) {
      showToast('套用失敗: ' + String(e), 'error');
    }
  };

  const applyRulesForItem = async (item: FileItem) => {
    const category = itemByPath?.().get(pathKey(item.path))?.category ?? undefined;
    return applyRulesForTarget({ path: item.path, category });
  };

  return { applyRulesForTarget, applyRulesForItem };
}
