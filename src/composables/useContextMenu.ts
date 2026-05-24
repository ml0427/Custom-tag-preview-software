import { ref, onMounted, onUnmounted } from 'vue';

/**
 * 右鍵選單邏輯 Composable
 * 用於管理選單的顯示狀態、座標位置以及當前選取的項目。
 * 內建視窗邊界溢出保護與滾動時自動隱藏。
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
    e.preventDefault();

    // 預估選單的寬高（可依實際樣式調整）
    const menuWidth = 180;
    const menuHeight = 220;

    let x = e.clientX;
    let y = e.clientY;

    // 防止右側溢出
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 8;
    }
    // 防止下方溢出
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 8;
    }

    // 確保坐標不小於 0
    contextMenu.value = {
      visible: true,
      x: Math.max(0, x),
      y: Math.max(0, y),
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
  // 滾動時也自動隱藏，避免選單漂浮在畫面上
  onMounted(() => {
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('scroll', hideContextMenu, { capture: true });
  });

  onUnmounted(() => {
    document.removeEventListener('click', hideContextMenu);
    document.removeEventListener('scroll', hideContextMenu, { capture: true });
  });

  return {
    contextMenu,
    showContextMenu,
    hideContextMenu,
  };
}
