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
  const isSourceBusy = ref(false);
  const sourceProgressLabel = ref('');

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
    isSourceBusy.value = true;
    sourceProgressLabel.value = '正在掃描子目錄並建立追蹤紀錄...';
    try {
      const result = await api.addSource(path);
      options.showToast(`已新增來源，匯入 ${result.importedCount} 個子目錄`, 'success');
      await loadSources();
    } catch (e) {
      options.showToast('新增來源失敗: ' + String(e), 'error');
    } finally {
      isSourceBusy.value = false;
      sourceProgressLabel.value = '';
    }
  };

  const handleRemoveSource = async (source: Source, e: MouseEvent) => {
    e.stopPropagation();
    if (!await options.confirmDialog(`確定移除「${source.path}」？\n底下已追蹤的子目錄與縮圖快取也會一併清除。`)) return;
    isSourceBusy.value = true;
    sourceProgressLabel.value = '正在清除來源底下的追蹤紀錄...';
    try {
      const result = await api.removeSource(source.id);
      if (options.selectedPath()?.startsWith(source.path)) options.select(null);
      options.showToast(`已移除來源，清除 ${result.removedCount} 筆追蹤紀錄`, 'success');
      await loadSources();
    } catch (error) {
      options.showToast('移除來源失敗: ' + String(error), 'error');
    } finally {
      isSourceBusy.value = false;
      sourceProgressLabel.value = '';
    }
  };

  return {
    sources,
    isSourceBusy,
    sourceProgressLabel,
    loadSources,
    handleSelectPath,
    handleAddSource,
    handleRemoveSource,
  };
}
