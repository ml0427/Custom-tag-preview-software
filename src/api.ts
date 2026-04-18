// api.ts
import { invoke } from '@tauri-apps/api/core';

export interface Tag {
    id: number;
    name: string;
}

export interface Comic {
    id: number;
    filePath: string;
    title: string;
    customCoverPath: string | null;
    importTime: string;
    fileSize: number;
    fileModifiedTime: string;
    tags: Tag[];
}

export interface Page<T> {
    content: T[];
    totalPages: number;
    totalElements: number;
    number: number;
    size: number;
}

export const api = {
    async getComics(page = 0, size = 20, tagId?: number): Promise<Page<Comic>> {
        return await invoke<Page<Comic>>('get_comics', { page, size, tagId });
    },

    async getComic(id: number): Promise<Comic> {
        // We don't have a specific get_comic yet, but list can serve or we can add it.
        // For now, let's assume we can get it from the list or implement if needed.
        const page = await this.getComics(0, 1);
        return page.content[0];
    },

    async getTags(): Promise<Tag[]> {
        return await invoke<Tag[]>('get_tags');
    },

    async createTag(name: string): Promise<Tag> {
        // Not implemented in Rust yet, but we can add it if needed
        return await invoke<Tag>('create_tag', { name });
    },

    async deleteTag(id: number): Promise<void> {
        await invoke('delete_tag', { id });
    },

    async addTagToComic(comicId: number, tagId: number): Promise<void> {
        await invoke('add_tag_to_comic', { comic_id: comicId, tag_id: tagId });
    },

    async removeTagFromComic(comicId: number, tagId: number): Promise<void> {
        await invoke('remove_tag_from_comic', { comic_id: comicId, tag_id: tagId });
    },

    async getComicImages(comicId: number): Promise<string[]> {
        return await invoke<string[]>('get_comic_images', { id: comicId });
    },

    async setComicCover(comicId: number, imagePath: string): Promise<void> {
        await invoke('set_comic_cover', { id: comicId, imagePath });
    },

    async scanDirectory(path: string): Promise<{ message: string, addedCount: number }> {
        return await invoke<{ message: string, addedCount: number }>('scan_directory', { path });
    },

    getCoverUrl(comicId: number): string {
        // Using the custom protocol registered in main.rs
        return `comic-cache://localhost/${comicId}.jpg?stamp=${Date.now()}`;
    },

    async getCoverBase64(comicId: number): Promise<string> {
        // More reliable alternative: get cover as base64 data URL
        return await invoke<string>('get_cover_base64', { id: comicId });
    },
    
    async renameComic(id: number, title: string): Promise<Comic> {
        return await invoke<Comic>('rename_comic', { id, title });
    }
}
