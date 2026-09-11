import { api, type Item } from '../api';
import { useToast } from './useToast';
import { resolveEffectiveItemRules } from '../utils/effectiveItemRules';

export function useRenameTagSync() {
  const { show, confirm } = useToast();

  const syncTagsAfterRename = async (before: Item, after: Item): Promise<void> => {
    if (before.name === after.name) return;
    try {
      const types = await api.getItemTypes();
      const rules = await resolveEffectiveItemRules(after, types);
      const changes = await api.syncRenamedItemTags(after.id, before.name, after.name, rules);
      if (!changes.added.length && !changes.removed.length) return;
      const lines = [
        `名稱已更新為「${after.name}」。是否同步修改標籤？`,
        changes.added.length ? `新增：${changes.added.join('、')}` : '新增：無',
        changes.removed.length ? `移除：${changes.removed.join('、')}` : '移除：無',
        '選「否」只新增，保留舊標籤；選「是」同步以上變更，其他標籤保留。',
      ];
      const replace = await confirm(lines.join('\n'), {
        confirmLabel: '是，同步變更', cancelLabel: '否，只新增',
      });
      await api.syncRenamedItemTags(after.id, before.name, after.name, rules, replace);
      show(replace ? '已同步改名影響的標籤' : '已新增新標籤，保留原有標籤', 'success');
    } catch (error) {
      // 改名已完成；標籤錯誤不能被呈現成改名失敗，也必須讓呼叫端繼續更新畫面。
      show('名稱已更新，但標籤同步失敗：' + String(error), 'error');
    }
  };

  return { syncTagsAfterRename };
}
