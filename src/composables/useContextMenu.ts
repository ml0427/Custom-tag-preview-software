import { ref, onMounted, onUnmounted } from 'vue';

/**
 * 右鍵選單邏輯 Composable
 * 用於管理選單的顯示狀態、座標位置以及當前選取的項目。
 */
export function useContextMenu<T>() {
  const contextMenu = ref<{
    visible: boolean;
    x: number;
    y: number;
    item: T | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    item: null,
  });

  /**
   * 顯示右鍵選單
   * @param e 滑鼠事件
   * @param item 被點擊的資料項目
   */
  const showContextMenu = (e: MouseEvent, item: T) => {
    contextMenu.value = {
      visible: true,
      x: e.clientX,
      y: e.clientY,
      item,
    };
  };

  /**
   * 隱藏右鍵選單
   */
  const hideContextMenu = () => {
    contextMenu.value.visible = false;
  };

  // 全域點擊時自動隱藏選單
  onMounted(() => {
    document.addEventListener('click', hideContextMenu);
  });

  onUnmounted(() => {
    document.removeEventListener('click', hideContextMenu);
  });

  return {
    contextMenu,
    showContextMenu,
    hideContextMenu,
  };
}
