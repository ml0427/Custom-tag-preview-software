// api.ts
import { invoke } from '@tauri-apps/api/core';

export interface Tag {
    id: number;
    name: string;
    color?: string | null;
}

// Unified Item — replaces Comic + Folder
export interface Item {
    id: number;
    path: string;
    itemType: 'file' | 'folder';
    name: string;
    fileSize: number | null;
    fileModifiedAt: number | null;   // Unix timestamp (seconds)
    coverCachePath: string | null;
    fingerprint: string | null;
    note: string | null;
    category: string | null;
    importAt: string;
    tags: Tag[];
}

// Legacy Comic (kept for internal compat; maps to Item with itemType='file')
interface Comic {
    id: number;
    filePath: string;
    title: string;
    customCoverPath: string | null;
    importTime: string;
    fileSize: number;
    fileModifiedTime: string;
    tags: Tag[];
}

// Legacy Folder (used by SourcePanel)
interface Folder {
    id: number;
    path: string;
    name: string;
    category: string;
    note: string;
    createdAt: string;
    tags: Tag[];
}

export interface FileItem {
    name: string;
    path: string;
    isDir: boolean;
    fileSize: number | null;
    modifiedTime: string | null;
    extension: string | null;
}

export interface Source {
    id: number;
    path: string;
    lastSync: string | null;
}

export interface Page<T> {
    content: T[];
    totalPages: number;
    totalElements: number;
    number: number;
    size: number;
}

export interface TagCount {
    id: number;
    count: number;
}

export interface TagRule {
    id: number;
    name: string;
    matchType: string;
    pattern: string;
    tagName: string;
}

export interface TagRuleInput {
    name: string;
    matchType: string;
    pattern: string;
    tagName: string;
}

export interface ScanPreviewItem {
    path: string;
    name: string;
    isDir: boolean;
    proposedTags: string[];
}

export interface ItemType {
    id: number;
    name: string;
    icon: string;
    displayName: string;
    color: string | null;
    isBuiltin: boolean;
    extensions: string[];
}

export interface ItemTypeInput {
    name: string;
    icon: string;
    displayName: string;
    color: string | null;
    extensions: string[];
}

export const api = {
    // ── Items (primary API) ───────────────────────────────────────────────────
    async getItems(
        page = 0,
        size = 9999,
        tagIds?: number[],
        sortBy?: string,
        sortDir?: string,
        sourcePath?: string,
        itemType?: string,
    ): Promise<Page<Item>> {
        return await invoke<Page<Item>>('get_items', { page, size, tagIds, sortBy, sortDir, sourcePath, itemType });
    },

    async getItem(id: number): Promise<Item> {
        return await invoke<Item>('get_item', { id });
    },

    async getItemByPath(path: string): Promise<Item | null> {
        return await invoke<Item | null>('get_item_by_path', { path });
    },

    async tagItem(itemId: number, tagId: number): Promise<void> {
        await invoke('tag_item', { itemId, tagId });
    },

    async untagItem(itemId: number, tagId: number): Promise<void> {
        await invoke('untag_item', { itemId, tagId });
    },

    async renameItem(id: number, name: string): Promise<Item> {
        return await invoke<Item>('rename_item', { id, name });
    },

    async getItemImages(id: number): Promise<string[]> {
        return await invoke<string[]>('get_item_images', { id });
    },

    async setItemCover(id: number, imagePath: string): Promise<void> {
        await invoke('set_item_cover', { id, imagePath });
    },

    async getCoverBase64(id: number): Promise<string> {
        return await invoke<string>('get_cover_base64', { id });
    },

    async getZipCoverByPath(path: string): Promise<string> {
        return await invoke<string>('get_zip_cover_by_path', { path });
    },

    // ── Tags ──────────────────────────────────────────────────────────────────
    async getTags(): Promise<Tag[]> {
        return await invoke<Tag[]>('get_tags');
    },

    async createTag(name: string): Promise<Tag> {
        return await invoke<Tag>('create_tag', { name });
    },

    async deleteTag(id: number): Promise<void> {
        await invoke('delete_tag', { id });
    },

    async renameTag(id: number, name: string): Promise<Tag> {
        return await invoke<Tag>('rename_tag', { id, name });
    },
    async setTagColor(id: number, color: string | null): Promise<Tag> {
        return await invoke<Tag>('set_tag_color', { id, color });
    },

    async mergeTags(sourceId: number, targetId: number): Promise<void> {
        await invoke('merge_tags', { sourceId, targetId });
    },

    async searchTags(query: string): Promise<Tag[]> {
        return await invoke<Tag[]>('search_tags', { query });
    },

    async getTagCounts(): Promise<TagCount[]> {
        return await invoke<TagCount[]>('get_tag_counts');
    },

    // ── Scan ──────────────────────────────────────────────────────────────────
    async scanDirectory(path: string): Promise<{ message: string; addedCount: number }> {
        return await invoke('scan_directory', { path });
    },

    async incrementalScan(path: string): Promise<{ message: string; added: number; updated: number; removed: number }> {
        return await invoke('incremental_scan', { path });
    },

    // ── Sources ───────────────────────────────────────────────────────────────
    async getSources(): Promise<Source[]> {
        return await invoke<Source[]>('get_sources');
    },

    async addSource(path: string): Promise<Source> {
        return await invoke<Source>('add_source', { path });
    },

    async removeSource(id: number): Promise<void> {
        await invoke('remove_source', { id });
    },

    async syncSources(): Promise<{ added: number; updated: number; removed: number; sourceCount: number; errors: string[] }> {
        return await invoke('sync_sources');
    },

    // ── Folders (SourcePanel backward compat) ────────────────────────────────
    async getFolders(tagId?: number, search?: string): Promise<Folder[]> {
        return await invoke<Folder[]>('get_folders', { tagId, search });
    },

    async createFolder(path: string, name: string, category: string, note: string): Promise<Folder> {
        return await invoke<Folder>('create_folder', { path, name, category, note });
    },

    async updateFolder(id: number, name: string, category: string, note: string): Promise<Folder> {
        return await invoke<Folder>('update_folder', { id, name, category, note });
    },

    async deleteFolder(id: number): Promise<void> {
        await invoke('delete_folder', { id });
    },

    async trashItem(path: string): Promise<void> {
        await invoke('trash_item', { path });
    },

    async untrackItem(path: string): Promise<void> {
        await invoke('untrack_item', { path });
    },

    async addTagToFolder(folderId: number, tagId: number): Promise<void> {
        await invoke('add_tag_to_folder', { folderId, tagId });
    },

    async removeTagFromFolder(folderId: number, tagId: number): Promise<void> {
        await invoke('remove_tag_from_folder', { folderId, tagId });
    },

    // ── File system ───────────────────────────────────────────────────────────
    async openFile(path: string): Promise<void> {
        await invoke('open_file', { path });
    },

    async listSubdirs(path: string): Promise<string[]> {
        return await invoke<string[]>('list_subdirs', { path });
    },

    async listDirFiles(path: string): Promise<FileItem[]> {
        return await invoke<FileItem[]>('list_dir_files', { path });
    },

    async getImageBase64ByPath(path: string): Promise<string> {
        return await invoke<string>('get_image_base64_by_path', { path });
    },

    // ── Tag rules & scan wizard ───────────────────────────────────────────────
    async getTagRules(): Promise<TagRule[]> {
        return await invoke<TagRule[]>('get_tag_rules');
    },
    async saveTagRules(rules: TagRuleInput[]): Promise<void> {
        return await invoke('save_tag_rules', { rules });
    },
    async previewTagScan(scopePath: string, rules: TagRuleInput[]): Promise<ScanPreviewItem[]> {
        return await invoke<ScanPreviewItem[]>('preview_tag_scan', { scopePath, rules });
    },
    async applyTagScan(scopePath: string, rules: TagRuleInput[]): Promise<{ added: number; updated: number; removed: number; tagged: number }> {
        return await invoke('apply_tag_scan', { scopePath, rules });
    },

    // ── Duplicate detection ───────────────────────────────────────────────────
    async getDuplicateGroups(): Promise<{ fingerprint: string; items: Item[] }[]> {
        return await invoke('get_duplicate_groups');
    },
    async computeFingerprints(): Promise<number> {
        return await invoke('compute_fingerprints');
    },

    // ── Item Types ────────────────────────────────────────────────────────────
    async getItemTypes(): Promise<ItemType[]> {
        return await invoke<ItemType[]>('get_item_types');
    },

    async createItemType(input: ItemTypeInput): Promise<ItemType> {
        return await invoke<ItemType>('create_item_type', { input });
    },

    async updateItemType(id: number, input: ItemTypeInput): Promise<ItemType> {
        return await invoke<ItemType>('update_item_type', { id, input });
    },

    async deleteItemType(id: number): Promise<void> {
        await invoke('delete_item_type', { id });
    },
}
