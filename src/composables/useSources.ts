import { ref } from 'vue';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { api, type Source } from '../api';
import type { ToastType } from './useToast';

interface UseSourcesOptions {
  selectedPath: () => string | null;
  select: (path: string | null) => void;
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  confirmDialog: (message: string) => Promise<boolean>;
}

export function useSources(options: UseSourcesOptions) {
  const sources = ref<Source[]>([]);

  const loadSources = async () => {
    sources.value = await api.getSources();
    if (options.selectedPath() === null && sources.value.length > 0) {
      options.select(sources.value[0].path);
    }
  };

  const handleSelectPath = (path: string) => {
    options.select(path);
  };

  const handleAddSource = async () => {
    const path = await openDialog({ directory: true, multiple: false, title: '新增工作目錄' });
    if (typeof path !== 'string') return;
    try {
      await api.addSource(path);
      await loadSources();
    } catch (e) {
      options.showToast('新增來源失敗: ' + String(e), 'error');
    }
  };

  const handleRemoveSource = async (source: Source, e: MouseEvent) => {
    e.stopPropagation();
    if (!await options.confirmDialog(`確定移除「${source.path}」？\n（不影響已匯入的項目資料）`)) return;
    await api.removeSource(source.id);
    if (options.selectedPath()?.startsWith(source.path)) options.select(null);
    await loadSources();
  };

  return {
    sources,
    loadSources,
    handleSelectPath,
    handleAddSource,
    handleRemoveSource,
  };
}
