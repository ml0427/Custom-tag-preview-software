// api.ts
export const API_BASE = 'http://localhost:8080/api';

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
        const url = new URL(`${API_BASE}/comics`);
        url.searchParams.append('page', page.toString());
        url.searchParams.append('size', size.toString());
        if (tagId !== undefined) {
            url.searchParams.append('tagId', tagId.toString());
        }
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error('Failed to fetch comics');
        return res.json();
    },

    async getComic(id: number): Promise<Comic> {
        const res = await fetch(`${API_BASE}/comics/${id}`);
        if (!res.ok) throw new Error('Failed to fetch comic');
        return res.json();
    },

    async getTags(): Promise<Tag[]> {
        const res = await fetch(`${API_BASE}/tags`);
        if (!res.ok) throw new Error('Failed to fetch tags');
        return res.json();
    },

    async createTag(name: string): Promise<Tag> {
        const res = await fetch(`${API_BASE}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (!res.ok) throw new Error('Failed to create tag');
        return res.json();
    },

    async deleteTag(id: number): Promise<void> {
        await fetch(`${API_BASE}/tags/${id}`, { method: 'DELETE' });
    },

    async addTagToComic(comicId: number, tagId: number): Promise<void> {
        await fetch(`${API_BASE}/comics/${comicId}/tags/${tagId}`, { method: 'POST' });
    },

    async removeTagFromComic(comicId: number, tagId: number): Promise<void> {
        await fetch(`${API_BASE}/comics/${comicId}/tags/${tagId}`, { method: 'DELETE' });
    },

    async getComicImages(comicId: number): Promise<string[]> {
        const res = await fetch(`${API_BASE}/comics/${comicId}/images`);
        if (!res.ok) throw new Error('Failed to fetch comic images');
        return res.json();
    },

    async setComicCover(comicId: number, imagePath: string): Promise<void> {
        await fetch(`${API_BASE}/comics/${comicId}/cover`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagePath })
        });
    },

    async scanDirectory(path: string): Promise<{ message: string, addedCount: number }> {
        const res = await fetch(`${API_BASE}/comics/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        if (!res.ok) throw new Error('Failed to scan directory');
        return res.json();
    },

    getCoverUrl(comicId: number): string {
        return `${API_BASE}/comics/${comicId}/cover?stamp=${Date.now()}`;
    }
}
