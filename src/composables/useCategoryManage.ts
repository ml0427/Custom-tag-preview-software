import { ref } from 'vue';
import { api, type ItemType, type ItemTypeInput } from '../api';
import { useItemTypes } from './useItemTypes';
import { useToast } from './useToast';

export function useCategoryManage() {
    const { itemTypes, load, invalidate } = useItemTypes();
    const { show: showToast, confirm: confirmDialog } = useToast();

    const selected = ref<ItemType | null>(null);
    const isNew = ref(false);
    const saving = ref(false);

    const form = ref<{ name: string; icon: string; displayName: string; color: string; extensions: string[]; tagRules: Array<{ matchType: string; pattern: string; tagName: string }> }>({
        name: '', icon: '📁', displayName: '', color: '', extensions: [], tagRules: [],
    });
    const extInput = ref('');

    const selectFirst = () => {
        if (itemTypes.value.length > 0) selectType(itemTypes.value[0]);
        else startNew();
    };

    const selectType = (t: ItemType) => {
        selected.value = t;
        isNew.value = false;
        form.value = {
            name: t.name, icon: t.icon, displayName: t.displayName, color: t.color ?? '',
            extensions: [...t.extensions],
            tagRules: (t.tagRules ?? []).map(r => ({ matchType: r.matchType, pattern: r.pattern, tagName: r.tagName })),
        };
        extInput.value = '';
    };

    const startNew = () => {
        selected.value = null;
        isNew.value = true;
        form.value = { name: '', icon: '📁', displayName: '', color: '', extensions: [], tagRules: [] };
        extInput.value = '';
    };

    const addRule = () => {
        form.value.tagRules.push({ matchType: 'prefix', pattern: '', tagName: '' });
    };

    const removeRule = (i: number) => {
        form.value.tagRules.splice(i, 1);
    };

    const addExt = () => {
        const ext = extInput.value.trim().toLowerCase().replace(/^\./, '');
        if (ext && !form.value.extensions.includes(ext)) {
            form.value.extensions.push(ext);
        }
        extInput.value = '';
    };

    const removeExt = (ext: string) => {
        form.value.extensions = form.value.extensions.filter(e => e !== ext);
    };

    const save = async () => {
        if (!form.value.displayName.trim()) { showToast('請填寫顯示名稱', 'error'); return; }
        if (isNew.value && !form.value.name.trim()) { showToast('請填寫識別名稱', 'error'); return; }
        if (isNew.value && !/^[a-z0-9_]+$/.test(form.value.name)) { showToast('識別名稱只能使用小寫英數字與底線', 'error'); return; }

        const extChanged = !isNew.value && selected.value &&
            JSON.stringify([...selected.value.extensions].sort()) !== JSON.stringify([...form.value.extensions].sort());

        saving.value = true;
        try {
            const input: ItemTypeInput = {
                name: form.value.name,
                icon: form.value.icon || '📁',
                displayName: form.value.displayName,
                color: form.value.color || null,
                extensions: form.value.extensions,
                tagRules: form.value.tagRules.map(r => ({ name: '', matchType: r.matchType, pattern: r.pattern, tagName: r.tagName })),
            };
            if (isNew.value) {
                const created = await api.createItemType(input);
                invalidate();
                await load(true);
                const t = itemTypes.value.find(x => x.id === created.id);
                if (t) selectType(t);
                if (form.value.extensions.length > 0) {
                    showToast('已儲存。請重新掃描來源資料夾，讓新副檔名生效。', 'success');
                } else {
                    showToast('已儲存', 'success');
                }
            } else if (selected.value) {
                const updated = await api.updateItemType(selected.value.id, input);
                invalidate();
                await load(true);
                const t = itemTypes.value.find(x => x.id === updated.id);
                if (t) selectType(t);
                if (extChanged) {
                    showToast('已儲存。副檔名已變更，請重新掃描來源資料夾讓更動生效。', 'success');
                } else {
                    showToast('已儲存', 'success');
                }
            }
        } catch (e: any) {
            showToast('儲存失敗：' + (e?.message ?? e), 'error');
        } finally {
            saving.value = false;
        }
    };

    const deleteType = async (t: ItemType) => {
        if (t.isBuiltin) return;
        if (!await confirmDialog(`確定刪除「${t.displayName}」類型？\n使用此類型的資料夾將重設為「一般資料夾」。`)) return;
        try {
            await api.deleteItemType(t.id);
            invalidate();
            await load(true);
            selectFirst();
            showToast('已刪除', 'success');
        } catch (e: any) {
            showToast('刪除失敗：' + (e?.message ?? e), 'error');
        }
    };

    return {
        itemTypes,
        load,
        selected,
        isNew,
        saving,
        form,
        extInput,
        selectFirst,
        selectType,
        startNew,
        addRule,
        removeRule,
        addExt,
        removeExt,
        save,
        deleteType
    };
}
