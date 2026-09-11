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

const rulesForType = (types: ItemType[], typeId: number | null | undefined): TagRuleInput[] => (
  types.find(type => type.id === typeId)?.tagRules ?? []
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

export const resolveEffectiveItemRules = async (
  item: Item,
  types: ItemType[],
  category?: string | null,
): Promise<TagRuleInput[]> => {
  if (item.itemType === 'folder') {
    const preset = await api.getFolderRulePreset(item.id);
    return rulesForType(types, preset?.presetTypeId);
  }

  const categoryName = category ?? item.category ?? 'default';
  const categoryRules = types.find(type => type.name === categoryName)?.tagRules ?? [];
  if (categoryRules.length > 0) return categoryRules;

  const parent = await findNearestTrackedParent(item.path);
  if (!parent) return [];

  const preset = await api.getFolderRulePreset(parent.id);
  return rulesForType(types, preset?.presetTypeId);
};
