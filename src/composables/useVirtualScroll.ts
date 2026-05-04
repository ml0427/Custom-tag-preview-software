import { ref, computed, onMounted, onUnmounted, watch, nextTick, type Ref } from 'vue';

/**
 * 虛擬滾動邏輯 Composable
 * @param items 原始資料列表 (Ref)
 * @param rowHeight 每行高度 (固定值)
 * @param buffer 緩衝項目數量 (預期可見範圍外多渲染的項目)
 */
export function useVirtualScroll<T>(
  items: Ref<T[]>,
  rowHeight: number,
  buffer: number = 15
) {
  const outerRef = ref<HTMLElement | null>(null);
  const scrollTop = ref(0);
  const containerHeight = ref(0);

  // 計算可見範圍的索引
  const visibleStart = computed(() => Math.max(0, Math.floor(scrollTop.value / rowHeight) - buffer));
  const visibleEnd = computed(() => {
    const len = items.value.length;
    if (containerHeight.value <= 0) return Math.min(len, 30); // 初始沒量到高度時先顯示 30 筆
    return Math.min(
      len,
      Math.ceil((scrollTop.value + containerHeight.value) / rowHeight) + buffer
    );
  });

  // 暴露給元件的計算屬性
  const visibleItems = computed(() => items.value.slice(visibleStart.value, visibleEnd.value));
  const topSpacerHeight = computed(() => visibleStart.value * rowHeight);
  const bottomSpacerHeight = computed(() => (items.value.length - visibleEnd.value) * rowHeight);

  // 滾動事件處理
  const onOuterScroll = (e: Event) => {
    scrollTop.value = (e.target as HTMLElement).scrollTop;
  };

  /**
   * 滾動到特定索引，確保該項目在可見範圍內
   */
  const scrollToIndex = (idx: number) => {
    if (!outerRef.value) return;
    const rowTop = idx * rowHeight;
    const rowBottom = rowTop + rowHeight;
    const { scrollTop: st, clientHeight: ch } = outerRef.value;
    if (rowTop < st) {
      outerRef.value.scrollTop = rowTop;
    } else if (rowBottom > st + ch) {
      outerRef.value.scrollTop = rowBottom - ch;
    }
  };

  let resizeObserver: ResizeObserver | null = null;

  onMounted(() => {
    if (outerRef.value) {
      containerHeight.value = outerRef.value.clientHeight;
      outerRef.value.addEventListener('scroll', onOuterScroll, { passive: true });
      
      resizeObserver = new ResizeObserver(entries => {
        if (entries[0]) {
          containerHeight.value = entries[0].contentRect.height;
        }
      });
      resizeObserver.observe(outerRef.value);
    }
  });

  onUnmounted(() => {
    outerRef.value?.removeEventListener('scroll', onOuterScroll);
    resizeObserver?.disconnect();
  });

  // 當資料項改變時，通常需要重置滾動位置與重新測量高度
  watch(items, (newVal) => {
    if (!newVal) return;
    scrollTop.value = 0;
    if (outerRef.value) outerRef.value.scrollTop = 0;
    
    // 多層級確保高度被正確捕捉 (應對動畫或非同步渲染導致的高度延遲)
    const measure = () => {
      if (outerRef.value) {
        const h = outerRef.value.clientHeight;
        if (h > 0) containerHeight.value = h;
      }
    };
    
    measure();
    nextTick(measure);
    requestAnimationFrame(measure);
  }, { immediate: true });

  return {
    outerRef,
    scrollTop,
    containerHeight,
    visibleStart,
    visibleEnd,
    visibleItems,
    topSpacerHeight,
    bottomSpacerHeight,
    scrollToIndex,
  };
}
