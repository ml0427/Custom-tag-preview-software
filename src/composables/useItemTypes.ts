import { ref, readonly } from 'vue';
import { api, type ItemType } from '../api';

const itemTypes = ref<ItemType[]>([]);
let loaded = false;

const DEFAULT_TYPE: ItemType = {
    id: 0,
    name: 'default',
    icon: '📁',
    displayName: '一般資料夾',
    color: null,
    isBuiltin: true,
    extensions: [],
};

export function useItemTypes() {
    const load = async (force = false) => {
        if (loaded && !force) return;
        itemTypes.value = await api.getItemTypes();
        loaded = true;
    };

    const getTypeConfig = (name: string | null | undefined): ItemType => {
        const found = itemTypes.value.find(t => t.name === (name ?? 'default'));
        return found ?? DEFAULT_TYPE;
    };

    const getTypeByExtension = (ext: string | null | undefined): ItemType | null => {
        if (!ext) return null;
        const lower = ext.toLowerCase();
        return itemTypes.value.find(t => t.extensions.includes(lower)) ?? null;
    };

    const invalidate = () => { loaded = false; };

    return {
        itemTypes: readonly(itemTypes),
        load,
        getTypeConfig,
        getTypeByExtension,
        invalidate,
    };
}
