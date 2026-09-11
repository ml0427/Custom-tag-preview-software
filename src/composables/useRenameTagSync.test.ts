import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type Item, type ItemType, type FolderRulePreset } from '../api';
import { useRenameTagSync } from './useRenameTagSync';

const toast = vi.hoisted(() => ({ show: vi.fn(), confirm: vi.fn() }));
vi.mock('./useToast', () => ({ useToast: () => toast }));
vi.mock('../api', () => ({ api: {
  getItemTypes: vi.fn(), getFolderRulePreset: vi.fn(), getItemByPath: vi.fn(), syncRenamedItemTags: vi.fn(),
} }));
const mocked = vi.mocked(api);
const before = { id: 7, name: '[デコ助18号] Book', path: 'C:/Library/book.zip', itemType: 'file', category: 'comic' } as Item;
const after = { ...before, name: '[デコ助] Book' };
const rules = [{ name: 'author', matchType: 'regex_capture', pattern: '^\\[(.*?)\\]', tagName: '' }];
const changes = { added: ['デコ助'], removed: ['デコ助18号'] };

describe('rename tag confirmation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.getItemTypes.mockResolvedValue([{ id: 4, name: 'comic', tagRules: rules } as ItemType]);
    mocked.getItemByPath.mockResolvedValue(null);
    mocked.getFolderRulePreset.mockResolvedValue(null);
    mocked.syncRenamedItemTags.mockResolvedValue(changes);
  });

  it.each([true, false])('previews before applying and forwards the choice %s', async choice => {
    let answer!: (value: boolean) => void;
    toast.confirm.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve; }));
    const pending = useRenameTagSync().syncTagsAfterRename(before, after);
    await vi.waitFor(() => expect(toast.confirm).toHaveBeenCalledOnce());
    expect(mocked.syncRenamedItemTags).toHaveBeenCalledTimes(1);
    expect(toast.confirm).toHaveBeenCalledWith(expect.stringContaining('移除：デコ助18号'), {
      confirmLabel: '是，同步變更', cancelLabel: '否，只新增',
    });
    answer(choice);
    await pending;
    expect(mocked.syncRenamedItemTags).toHaveBeenLastCalledWith(7, before.name, after.name, rules, choice);
  });

  it('does not prompt or write when the tag results are unchanged', async () => {
    mocked.syncRenamedItemTags.mockResolvedValue({ added: [], removed: [] });
    await useRenameTagSync().syncTagsAfterRename(before, after);
    expect(toast.confirm).not.toHaveBeenCalled();
    expect(mocked.syncRenamedItemTags).toHaveBeenCalledTimes(1);
  });

  it('uses the parent preset for uncategorized files', async () => {
    mocked.getItemByPath.mockResolvedValueOnce({ id: 2, itemType: 'folder' } as Item);
    mocked.getFolderRulePreset.mockResolvedValueOnce({ presetTypeId: 4 } as FolderRulePreset);
    toast.confirm.mockResolvedValue(false);
    await useRenameTagSync().syncTagsAfterRename(before, { ...after, category: null });
    expect(mocked.getItemByPath).toHaveBeenCalledWith('C:/Library');
    expect(mocked.getFolderRulePreset).toHaveBeenCalledWith(2);
    expect(mocked.syncRenamedItemTags).toHaveBeenLastCalledWith(7, before.name, after.name, rules, false);
  });

  it('checks built-in filename tags even without a custom rule set', async () => {
    mocked.getItemTypes.mockResolvedValue([]);
    toast.confirm.mockResolvedValue(true);
    await useRenameTagSync().syncTagsAfterRename(before, after);
    expect(mocked.syncRenamedItemTags).toHaveBeenLastCalledWith(7, before.name, after.name, [], true);
  });

  it('reports tag sync errors while allowing the saved name to refresh', async () => {
    mocked.syncRenamedItemTags.mockRejectedValue(new Error('db unavailable'));
    await expect(useRenameTagSync().syncTagsAfterRename(before, after)).resolves.toBeUndefined();
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('名稱已更新，但標籤同步失敗'), 'error');
    expect(toast.confirm).not.toHaveBeenCalled();
  });
});
