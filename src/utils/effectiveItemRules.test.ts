import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type FolderRulePreset, type Item, type ItemType } from '../api';
import { resolveEffectiveItemRuleSet, resolveEffectiveItemRules } from './effectiveItemRules';

vi.mock('../api', () => ({ api: { getItemByPath: vi.fn(), getFolderRulePreset: vi.fn() } }));
const apiMock = vi.mocked(api);
const comic = {
  id: 2, name: 'comic', tagRules: [{ name: '', matchType: 'contains', pattern: 'book', tagName: '漫畫' }],
} as ItemType;
const novel = { ...comic, id: 3, name: 'novel' };
const file = { id: 10, itemType: 'file', path: 'C:/Library/book.zip', category: 'comic' } as Item;

describe('rule settings destination', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('opens the file category when it has rules, without looking up a parent', async () => {
    expect(await resolveEffectiveItemRuleSet(file, [comic, novel])).toBe(comic);
    expect(apiMock.getItemByPath).not.toHaveBeenCalled();
  });

  it('opens inherited rules when the file category has none, matching rule application', async () => {
    const emptyComic = { ...comic, tagRules: [] };
    apiMock.getItemByPath.mockResolvedValue({ id: 20, itemType: 'folder' } as Item);
    apiMock.getFolderRulePreset.mockResolvedValue({ presetTypeId: novel.id } as FolderRulePreset);
    expect(await resolveEffectiveItemRuleSet(file, [emptyComic, novel])).toBe(novel);
    expect(await resolveEffectiveItemRules(file, [emptyComic, novel])).toEqual(novel.tagRules);
  });

  it('uses a folder preset rather than its category', async () => {
    apiMock.getFolderRulePreset.mockResolvedValue({ presetTypeId: comic.id } as FolderRulePreset);
    expect(await resolveEffectiveItemRuleSet({ ...file, itemType: 'folder', category: 'novel' }, [comic, novel])).toBe(comic);
    expect(apiMock.getItemByPath).not.toHaveBeenCalled();
  });

  it('lets an empty assigned rule set be edited while applying zero rules', async () => {
    const emptyComic = { ...comic, tagRules: [] };
    apiMock.getItemByPath.mockResolvedValue(null);
    expect(await resolveEffectiveItemRuleSet(file, [emptyComic])).toBe(emptyComic);
    expect(await resolveEffectiveItemRules(file, [emptyComic])).toEqual([]);
  });
});
