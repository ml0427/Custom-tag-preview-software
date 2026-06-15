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
    existsOnDisk: boolean;
    missingSince: string | null;
    lastSeenAt: string | null;
    importAt: string;
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

export interface AddSourceResult {
    source: Source;
    importedCount: number;
}

export interface RemoveSourceResult {
    removedCount: number;
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

export interface ScanResult {
    message: string;
    addedCount?: number;
    added?: number;
    updated?: number;
    removed?: number;
    cancelled: boolean;
}

export interface TagRuleTestHit {
    index: number;
    matchType: string;
    pattern: string;
    tags: string[];
    error: string | null;
}

export interface DuplicateItem extends Item {
    pathExists: boolean;
}

export type DuplicateGroupStatus = 'duplicate' | 'moved' | 'mixed';

export interface DuplicateGroup {
    fingerprint: string;
    status: DuplicateGroupStatus;
    items: DuplicateItem[];
}

export interface ItemType {
    id: number;
    name: string;
    icon: string;
    displayName: string;
    color: string | null;
    example: string;
    isBuiltin: boolean;
    extensions: string[];
    tagRules: TagRuleInput[];
}

export interface ItemTypeInput {
    name: string;
    icon: string;
    displayName: string;
    color: string | null;
    example: string;
    extensions: string[];
    tagRules: TagRuleInput[];
}

export interface FolderRulePreset {
    folderItemId: number;
    presetTypeId: number;
    presetName: string;
    presetDisplayName: string;
    presetIcon: string;
    applyToSubfolders: boolean;
    applyToFiles: boolean;
    fileExtensions: string[];
}

export interface FolderRulePresetInput {
    folderItemId: number;
    presetTypeId: number;
    applyToSubfolders: boolean;
    applyToFiles: boolean;
    fileExtensions: string[];
}

export const api = {
    // ── Items (primary API) ───────────────────────────────────────────────────
    async getItems(
        page = 0,
        size = 200,
        tagIds?: number[],
        sortBy?: string,
        sortDir?: string,
        sourcePath?: string,
        itemType?: string,
        includeMissing = false,
    ): Promise<Page<Item>> {
        return await invoke<Page<Item>>('get_items', { page, size, tagIds, sortBy, sortDir, sourcePath, itemType, includeMissing });
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

    async getItemImageBase64(id: number, imagePath: string): Promise<string> {
        return await invoke<string>('get_item_image_base64', { id, imagePath });
    },

    async getArchiveImagesByPath(path: string): Promise<string[]> {
        return await invoke<string[]>('get_archive_images_by_path', { path });
    },

    async getArchiveImageBase64ByPath(path: string, imagePath: string): Promise<string> {
        return await invoke<string>('get_archive_image_base64_by_path', { path, imagePath });
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

    /// 確保縮圖快取存在（comic-cache:// 的前置作業）
    async ensureThumbCache(id: number): Promise<void> {
        await invoke('ensure_thumb_cache', { id });
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

    async deleteEmptyTags(): Promise<number> {
        return await invoke<number>('delete_empty_tags');
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
    async scanDirectory(path: string): Promise<ScanResult> {
        return await invoke('scan_directory', { path, confirmFullRescan: true });
    },

    async incrementalScan(path: string): Promise<ScanResult> {
        return await invoke('incremental_scan', { path });
    },

    async cancelScan(): Promise<{ cancelled: boolean }> {
        return await invoke('cancel_scan');
    },

    // ── Sources ───────────────────────────────────────────────────────────────
    async getSources(): Promise<Source[]> {
        return await invoke<Source[]>('get_sources');
    },

    async addSource(path: string): Promise<AddSourceResult> {
        return await invoke<AddSourceResult>('add_source', { path });
    },

    async removeSource(id: number): Promise<RemoveSourceResult> {
        return await invoke<RemoveSourceResult>('remove_source', { id });
    },

    async syncSources(): Promise<{ added: number; updated: number; removed: number; sourceCount: number; errors: string[]; cancelled: boolean }> {
        return await invoke('sync_sources');
    },

    // ── Item-level mutations ──────────────────────────────────────────────────
    async setItemCategory(id: number, category: string): Promise<void> {
        await invoke('set_item_category', { id, category });
    },

    async setItemDisplayName(id: number, name: string): Promise<void> {
        await invoke('set_item_display_name', { id, name });
    },

    async setItemNote(id: number, note: string): Promise<void> {
        await invoke('set_item_note', { id, note });
    },

    async trashItem(path: string, opts?: { allowMissing?: boolean }): Promise<void> {
        await invoke('trash_item', { path, allowMissing: opts?.allowMissing ?? false });
    },

    async untrackItem(path: string, opts?: { allowMissing?: boolean }): Promise<void> {
        await invoke('untrack_item', { path, allowMissing: opts?.allowMissing ?? false });
    },

    // ── File system ───────────────────────────────────────────────────────────
    async openFile(path: string): Promise<void> {
        await invoke('open_file', { path });
    },

    /** 在檔案總管中顯示（選中路徑） */
    async openInExplorer(path: string): Promise<void> {
        await invoke('open_in_explorer', { path });
    },

    async listSubdirs(path: string): Promise<string[]> {
        return await invoke<string[]>('list_subdirs', { path });
    },

    async listDirFiles(path: string): Promise<FileItem[]> {
        return await invoke<FileItem[]>('list_dir_files', { path });
    },

    async quickImportItem(path: string): Promise<Item> {
        return await invoke<Item>('quick_import_item', { path });
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
    async testTagRules(name: string, rules: TagRuleInput[]): Promise<TagRuleTestHit[]> {
        return await invoke<TagRuleTestHit[]>('test_tag_rules', { name, rules });
    },
    async previewTagScan(scopePath: string, rules: TagRuleInput[]): Promise<ScanPreviewItem[]> {
        return await invoke<ScanPreviewItem[]>('preview_tag_scan', { scopePath, rules });
    },
    async applyTagScan(scopePath: string, rules: TagRuleInput[]): Promise<{ added: number; updated: number; removed: number; tagged: number }> {
        return await invoke('apply_tag_scan', { scopePath, rules });
    },
    async applyRulesToItem(itemId: number, rules: TagRuleInput[]): Promise<{ added: number; updated: number; removed: number; tagged: number }> {
        return await invoke('apply_rules_to_item', { itemId, rules });
    },

    // ── Folder default rule presets ───────────────────────────────────────────
    async getFolderRulePresets(): Promise<FolderRulePreset[]> {
        return await invoke<FolderRulePreset[]>('get_folder_rule_presets');
    },

    async getFolderRulePreset(folderItemId: number): Promise<FolderRulePreset | null> {
        return await invoke<FolderRulePreset | null>('get_folder_rule_preset', { folderItemId });
    },

    async setFolderRulePreset(input: FolderRulePresetInput): Promise<FolderRulePreset> {
        return await invoke<FolderRulePreset>('set_folder_rule_preset', { input });
    },

    async clearFolderRulePreset(folderItemId: number): Promise<void> {
        await invoke('clear_folder_rule_preset', { folderItemId });
    },

    // ── Duplicate detection
    async getDuplicateGroups(): Promise<DuplicateGroup[]> {
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

    // ── Debug mode ────────────────────────────────────────────────────────────
    async getDebugMode(): Promise<boolean> {
        return await invoke<boolean>('get_debug_mode');
    },

    async setDebugMode(enabled: boolean): Promise<void> {
        await invoke('set_debug_mode', { enabled });
    },

    async getDebugLogPath(): Promise<string> {
        return await invoke<string>('get_debug_log_path');
    },

    async openDebugLog(): Promise<void> {
        await invoke('open_debug_log');
    },

    async clearDebugLog(): Promise<void> {
        await invoke('clear_debug_log');
    },

}
