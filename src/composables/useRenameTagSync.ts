import { api, type Item, type TagRuleInput } from '../api';
import { useToast } from './useToast';

async function resolveRenameRules(item: Item): Promise<TagRuleInput[]> {
  const types = await api.getItemTypes();
  if (item.itemType === 'folder') {
    const preset = await api.getFolderRulePreset(item.id);
    return types.find(type => type.id === preset?.presetTypeId)?.tagRules ?? [];
  }
  const ownRules = types.find(type => type.name === (item.category ?? 'default'))?.tagRules;
  if (ownRules?.length) return ownRules;

  // 與右鍵套用規則一致：使用最近已追蹤父資料夾的預設規則。
  let path = item.path;
  while (true) {
    const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    if (index <= 0) return [];
    path = path.slice(0, index);
    const parentPath = /^[a-z]:$/i.test(path) ? `${path}\\` : path;
    const parent = await api.getItemByPath(parentPath);
    if (parent?.itemType === 'folder') {
      const preset = await api.getFolderRulePreset(parent.id);
      return types.find(type => type.id === preset?.presetTypeId)?.tagRules ?? [];
    }
  }
}

export function useRenameTagSync() {
  const { show, confirm } = useToast();

  const syncTagsAfterRename = async (before: Item, after: Item): Promise<void> => {
    if (before.name === after.name) return;
    try {
      const rules = await resolveRenameRules(after);
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
