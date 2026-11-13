import { api, type Item, type ItemType, type TagRuleInput } from '../api';

const parentPathOf = (path: string): string | null => {
  const separator = path.includes('\\') ? '\\' : '/';
  const normalized = path.replace(/\//g, '\\').replace(/\\+$/, '');
  const separatorIndex = normalized.lastIndexOf('\\');
  if (separatorIndex <= 0) return null;

  const parentPath = normalized.slice(0, separatorIndex);
  if (/^[a-z]:$/i.test(parentPath)) return `${parentPath}${separator}`;
  return parentPath.replace(/\\/g, separator);
};

const ruleSetForType = (types: ItemType[], typeId: number | null | undefined): ItemType | null => (
  types.find(type => type.id === typeId) ?? null
);

export const findNearestTrackedParent = async (path: string): Promise<Item | null> => {
  let currentPath = path;
  while (true) {
    const parentPath = parentPathOf(currentPath);
    if (!parentPath) return null;

    const parent = await api.getItemByPath(parentPath);
    if (parent?.itemType === 'folder') return parent;
    currentPath = parentPath;
  }
};

export const resolveEffectiveItemRuleSet = async (
  item: Item,
  types: ItemType[],
  category?: string | null,
): Promise<ItemType | null> => {
  if (item.itemType === 'folder') {
    const preset = await api.getFolderRulePreset(item.id);
    return ruleSetForType(types, preset?.presetTypeId);
  }

  const categoryName = category ?? item.category ?? 'default';
  const categoryType = types.find(type => type.name === categoryName) ?? null;
  if (categoryType?.tagRules.length) return categoryType;

  const parent = await findNearestTrackedParent(item.path);
  if (!parent) return categoryType;

  const preset = await api.getFolderRulePreset(parent.id);
  return ruleSetForType(types, preset?.presetTypeId) ?? categoryType;
};

export const resolveEffectiveItemRules = async (
  item: Item,
  types: ItemType[],
  category?: string | null,
): Promise<TagRuleInput[]> => (
  (await resolveEffectiveItemRuleSet(item, types, category))?.tagRules ?? []
);
