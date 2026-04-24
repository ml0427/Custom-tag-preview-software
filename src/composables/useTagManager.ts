import { ref } from 'vue';
import { api, type Tag } from '../api';
import { splitTagInput } from '../utils/tagUtils';
import { useToast } from './useToast';

interface TagManagerOptions {
    getEntityId: () => number | null;
    addTag: (entityId: number, tagId: number) => Promise<void>;
    removeTag: (entityId: number, tagId: number) => Promise<void>;
    onUpdated?: () => void;
}

export function useTagManager(options: TagManagerOptions) {
    const { show: showToast } = useToast();
    const localTags = ref<Tag[]>([]);
    const tagInput = ref('');
    const suggestions = ref<Tag[]>([]);
    const showSuggestions = ref(false);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const initTags = (tags: Tag[]) => {
        localTags.value = [...tags];
    };

    const onInputChange = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        const q = tagInput.value.trim();
        if (!q) { suggestions.value = []; showSuggestions.value = false; return; }
        debounceTimer = setTimeout(async () => {
            suggestions.value = await api.searchTags(q);
            showSuggestions.value = true;
        }, 200);
    };

    const submitInput = async () => {
        const entityId = options.getEntityId();
        if (entityId === null) return;
        const names = splitTagInput(tagInput.value);
        if (!names.length) return;
        const snapshotSuggestions = [...suggestions.value];
        tagInput.value = '';
        suggestions.value = [];
        showSuggestions.value = false;
        for (const name of names) {
            try {
                const existing = snapshotSuggestions.find(t => t.name.toLowerCase() === name.toLowerCase())
                    ?? (await api.searchTags(name)).find(t => t.name.toLowerCase() === name.toLowerCase());
                const tag = existing ?? await api.createTag(name);
                if (localTags.value.some(t => t.id === tag.id)) continue;
                await options.addTag(entityId, tag.id);
                localTags.value = [...localTags.value, tag];
            } catch (e) {
                showToast('新增標籤失敗: ' + String(e), 'error');
            }
        }
        options.onUpdated?.();
    };

    const selectSuggestion = async (tag: Tag) => {
        const entityId = options.getEntityId();
        if (entityId === null || localTags.value.some(t => t.id === tag.id)) return;
        tagInput.value = '';
        suggestions.value = [];
        showSuggestions.value = false;
        try {
            await options.addTag(entityId, tag.id);
            localTags.value = [...localTags.value, tag];
            options.onUpdated?.();
        } catch (e) {
            alert('新增標籤失敗: ' + String(e));
        }
    };

    const removeTagById = async (tagId: number) => {
        const entityId = options.getEntityId();
        if (entityId === null) return;
        try {
            await options.removeTag(entityId, tagId);
            localTags.value = localTags.value.filter(t => t.id !== tagId);
            options.onUpdated?.();
        } catch (e) {
            showToast('移除標籤失敗: ' + String(e), 'error');
        }
    };

    const hideSuggestions = () => {
        setTimeout(() => { showSuggestions.value = false; }, 150);
    };

    return {
        localTags,
        tagInput,
        suggestions,
        showSuggestions,
        initTags,
        onInputChange,
        submitInput,
        selectSuggestion,
        removeTagById,
        hideSuggestions,
    };
}
