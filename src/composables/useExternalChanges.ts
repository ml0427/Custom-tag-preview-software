import { ref, computed } from 'vue';
import { api, type FileItem, type Item, type ItemType } from '../api';
import { pathKey } from '../utils/pathKey';
import { useToast } from './useToast';
import { resolveEffectiveItemRules } from '../utils/effectiveItemRules';

export type ExternalChangeKind = 'untracked' | 'missing' | 'modified';

export interface ExternalChange {
  kind: ExternalChangeKind;
  path: string;
  name: string;
  itemType: 'file' | 'folder';
  message: string;
}

const parentPathKey = (path: string): string => {
  const normalized = path.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index > 0 ? pathKey(normalized.slice(0, index)) : '';
};

const parentDir = (path: string): string => {
  const normalized = path.replace(/[\\/]+$/, '');
  const idx = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
  return idx > 0 ? normalized.slice(0, idx) : normalized;
};

const isSameOrDescendantPath = (candidate: string, ancestor: string): boolean => {
  const candidateKey = pathKey(candidate);
  const ancestorKey = pathKey(ancestor);
  return candidateKey === ancestorKey || candidateKey.startsWith(`${ancestorKey}\\`);
};

export const getDistinctModifiedDirectories = (changes: readonly ExternalChange[]): string[] => {
  const directories = new Map<string, string>();
  for (const change of changes) {
    if (change.kind !== 'modified') continue;
    const directory = parentDir(change.path);
    if (directory) directories.set(pathKey(directory), directory);
  }

  return [...directories.values()]
    .sort((a, b) => pathKey(a).length - pathKey(b).length || pathKey(a).localeCompare(pathKey(b)))
    .filter((directory, index, all) => (
      !all.slice(0, index).some(ancestor => isSameOrDescendantPath(directory, ancestor))
    ));
};

const DB_PAGE_SIZE = 1000;
const FIX_CONCURRENCY = 10;

const loadAllDbItems = async (path: string): Promise<Item[]> => {
  const firstPage = await api.getItems(0, DB_PAGE_SIZE, undefined, 'importAt', 'desc', path, undefined, true);
  const items = [...firstPage.content];
  if (firstPage.totalPages <= 1) return items;

  const pages = Array.from({ length: firstPage.totalPages - 1 }, (_, index) => index + 1);
  const nextPages = await Promise.all(
    pages.map(page => api.getItems(page, DB_PAGE_SIZE, undefined, 'importAt', 'desc', path, undefined, true))
  );
  items.push(...nextPages.flatMap(page => page.content));
  return items;
};

const runInBatches = async <T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>,
) => {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(worker));
  }
};

export function computeExternalChanges(
  sourcePath: string,
  fileItems: FileItem[],
  dbItems: Item[],
): ExternalChange[] {
  const fsByPath = new Map(fileItems.map(item => [pathKey(item.path), item]));
  const dbByPath = new Map(dbItems.map(item => [pathKey(item.path), item]));
  const changes: ExternalChange[] = [];

  for (const fileItem of fileItems) {
    const dbItem = dbByPath.get(pathKey(fileItem.path));
    if (!dbItem) {
      changes.push({
        kind: 'untracked',
        path: fileItem.path,
        name: fileItem.name,
        itemType: fileItem.isDir ? 'folder' : 'file',
        message: '檔案系統有項目，但資料庫尚未追蹤',
      });
      continue;
    }
    if (!fileItem.isDir && dbItem.itemType === 'file') {
      const fsMtime = fileItem.modifiedTime ? Math.floor(new Date(fileItem.modifiedTime).getTime() / 1000) : null;
      const sizeChanged = dbItem.fileSize !== null && fileItem.fileSize !== null && dbItem.fileSize !== fileItem.fileSize;
      const mtimeChanged = dbItem.fileModifiedAt !== null && fsMtime !== null && Math.abs(dbItem.fileModifiedAt - fsMtime) > 90;
      if (sizeChanged || mtimeChanged) {
        changes.push({
          kind: 'modified',
          path: fileItem.path,
          name: fileItem.name,
          itemType: 'file',
          message: '磁碟上的大小或修改時間和資料庫紀錄不同',
        });
      }
    }
  }

  const currentKey = pathKey(sourcePath);
  for (const dbItem of dbItems) {
    if (parentPathKey(dbItem.path) !== currentKey) continue;
    if (!fsByPath.has(pathKey(dbItem.path))) {
      changes.push({
        kind: 'missing',
        path: dbItem.path,
        name: dbItem.name,
        itemType: dbItem.itemType,
        message: '資料庫有紀錄，但目前目錄中找不到項目',
      });
    }
  }

  return changes;
}

export function useExternalChanges(sourcePath: () => string | null) {
  const { show } = useToast();
  const changes = ref<ExternalChange[]>([]);
  const isLoading = ref(false);
  const isFixing = ref(false);
  const lastFixResult = ref<{ added: number; updated: number; removed: number } | null>(null);
  const dismissedKeys = ref<Set<string>>(new Set());
  let itemTypesCache: ItemType[] | null = null;
  let refreshToken = 0;

  const counts = computed(() => ({
    untracked: changes.value.filter(c => c.kind === 'untracked').length,
    missing: changes.value.filter(c => c.kind === 'missing').length,
    modified: changes.value.filter(c => c.kind === 'modified').length,
  }));

  const changeKey = (change: ExternalChange) => `${change.kind}::${pathKey(change.path)}`;

  const getItemTypes = async (): Promise<ItemType[]> => {
    itemTypesCache ??= await api.getItemTypes();
    return itemTypesCache;
  };

  const importUntrackedItem = async (path: string): Promise<void> => {
    const item = await api.quickImportItem(path);
    const types = await getItemTypes();
    const rules = await resolveEffectiveItemRules(item, types);
    if (rules.length > 0) await api.applyRulesToItem(item.id, rules);
  };

  const refresh = async () => {
    const token = ++refreshToken;
    const path = sourcePath();
    if (!path) {
      changes.value = [];
      isLoading.value = false;
      return;
    }
    isLoading.value = true;
    try {
      const [fileItems, dbItems] = await Promise.all([
        api.listDirFiles(path),
        loadAllDbItems(path),
      ]);
      if (token !== refreshToken || sourcePath() !== path) return;
      const detected = computeExternalChanges(path, fileItems, dbItems);
      changes.value = detected.filter(c => !dismissedKeys.value.has(changeKey(c)));
    } catch (e) {
      if (token !== refreshToken || sourcePath() !== path) return;
      console.error('[useExternalChanges] refresh failed', e);
      changes.value = [];
    } finally {
      if (token === refreshToken) isLoading.value = false;
    }
  };

  const fixAll = async () => {
    const path = sourcePath();
    if (!path) return;
    isFixing.value = true;

    let added = 0, removed = 0, updated = 0, errors = 0;
    const snapshot = [...changes.value];
    const modifiedDirectories = getDistinctModifiedDirectories(snapshot);
    try {
      await runInBatches(snapshot.filter(change => change.kind !== 'modified'), FIX_CONCURRENCY, async change => {
        try {
          if (change.kind === 'untracked') {
            await importUntrackedItem(change.path);
            added++;
          } else if (change.kind === 'missing') {
            await api.untrackItem(change.path, { allowMissing: true });
            removed++;
          }
        } catch (e) {
          errors++;
          console.error(`[useExternalChanges] fixAll item failed: ${change.path}`, e);
        }
      });

      for (const directory of modifiedDirectories) {
        try {
          const result = await api.incrementalScan(directory);
          added += result.added ?? 0;
          updated += result.updated ?? 0;
          removed += result.removed ?? 0;
        } catch (e) {
          errors++;
          console.error(`[useExternalChanges] fixAll directory failed: ${directory}`, e);
        }
      }

      lastFixResult.value = { added, updated, removed };
      dismissedKeys.value.clear();
      const errMsg = errors > 0 ? `（${errors} 項失敗）` : '';
      show(`已修復：新增 ${added}、更新 ${updated}、移除 ${removed}${errMsg}`, errors > 0 ? 'error' : 'success');
      await refresh();
    } catch (e) {
      console.error('[useExternalChanges] fixAll failed', e);
      show('全部修復失敗', 'error');
    } finally {
      isFixing.value = false;
    }
  };

  const importOne = async (path: string) => {
    isFixing.value = true;
    try {
      await importUntrackedItem(path);
      show('已匯入', 'success');
      await refresh();
    } catch (e) {
      console.error('[useExternalChanges] importOne failed', e);
      show('匯入失敗', 'error');
    } finally {
      isFixing.value = false;
    }
  };

  const removeMissingOne = async (path: string) => {
    isFixing.value = true;
    try {
      await api.untrackItem(path, { allowMissing: true });
      show('已移除紀錄', 'success');
      await refresh();
    } catch (e) {
      console.error('[useExternalChanges] removeMissingOne failed', e);
      show('移除失敗', 'error');
    } finally {
      isFixing.value = false;
    }
  };

  const syncFolderOf = async (filePath: string) => {
    const dir = parentDir(filePath);
    if (!dir) return;
    isFixing.value = true;
    try {
      const result = await api.incrementalScan(dir);
      lastFixResult.value = {
        added: result.added ?? 0,
        updated: result.updated ?? 0,
        removed: result.removed ?? 0,
      };
      show(`已同步所在資料夾：更新 ${result.updated ?? 0}`, result.cancelled ? 'info' : 'success');
      await refresh();
    } catch (e) {
      console.error('[useExternalChanges] syncFolderOf failed', e);
      show('同步失敗', 'error');
    } finally {
      isFixing.value = false;
    }
  };

  const dismissOne = (change: ExternalChange) => {
    const key = changeKey(change);
    dismissedKeys.value.add(key);
    changes.value = changes.value.filter(c => changeKey(c) !== key);
  };

  return {
    changes,
    counts,
    isLoading,
    isFixing,
    lastFixResult,
    refresh,
    fixAll,
    importOne,
    removeMissingOne,
    syncFolderOf,
    dismissOne,
  };
}
