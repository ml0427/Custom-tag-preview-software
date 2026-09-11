import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';

export interface VirtualGridRange {
  startRow: number;
  endRow: number;
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  totalRows: number;
}

export interface VirtualGridOptions {
  gap?: number;
  overscanRows?: number;
  minRowHeight?: number;
}

export const getEvenColumnCount = (containerWidth: number): number => {
  if (!Number.isFinite(containerWidth) || containerWidth < 1) return 2;
  if (containerWidth >= 1954) return 12;
  if (containerWidth >= 1626) return 10;
  if (containerWidth >= 1298) return 8;
  if (containerWidth >= 970) return 6;
  if (containerWidth >= 642) return 4;
  return 2;
};

export const getEstimatedRowHeight = (containerWidth: number, columnCount: number, gap = 14): number => {
  const cardWidth = Math.max(1, (containerWidth - gap * (columnCount - 1)) / columnCount);
  // ThumbnailCard keeps a 3:4 cover and an 88px information block.
  return Math.max(220, Math.ceil(cardWidth * 4 / 3 + 88 + gap));
};

export const getVirtualGridRange = (
  itemCount: number,
  columnCount: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscanRows = 2,
): VirtualGridRange => {
  const safeCount = Math.max(0, Math.floor(itemCount));
  const safeColumns = Math.max(2, Math.floor(columnCount));
  const safeRowHeight = Math.max(1, rowHeight);
  const totalRows = Math.ceil(safeCount / safeColumns);
  const safeScrollTop = Number.isFinite(scrollTop) && scrollTop > 0 ? scrollTop : 0;
  const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0;
  const safeOverscan = Math.max(0, Math.floor(overscanRows));
  const visibleRowCount = Math.max(1, Math.ceil(safeViewportHeight / safeRowHeight));
  const maxStartRow = Math.max(0, totalRows - visibleRowCount);
  const startRow = Math.min(
    maxStartRow,
    Math.max(0, Math.floor(safeScrollTop / safeRowHeight) - safeOverscan),
  );
  const endRow = Math.min(
    totalRows,
    Math.max(
      startRow + (safeCount > 0 ? 1 : 0),
      Math.ceil((safeScrollTop + safeViewportHeight) / safeRowHeight) + safeOverscan,
    ),
  );
  const startIndex = Math.min(safeCount, startRow * safeColumns);
  const endIndex = Math.min(safeCount, endRow * safeColumns);

  return {
    startRow,
    endRow,
    startIndex,
    endIndex,
    topSpacerHeight: startRow * safeRowHeight,
    bottomSpacerHeight: Math.max(0, (totalRows - endRow) * safeRowHeight),
    totalRows,
  };
};

export function useVirtualGrid<T>(
  items: Ref<T[]>,
  containerRef: Ref<HTMLElement | null>,
  options: VirtualGridOptions = {},
) {
  const gap = options.gap ?? 14;
  const overscanRows = options.overscanRows ?? 2;
  const minRowHeight = options.minRowHeight ?? 220;
  const containerWidth = ref(0);
  const viewportHeight = ref(0);
  const scrollTop = ref(0);
  const measuredRowHeight = ref<number | null>(null);
  const columnCount = computed(() => getEvenColumnCount(containerWidth.value));
  const rowHeight = computed(() => measuredRowHeight.value
    ?? getEstimatedRowHeight(containerWidth.value, columnCount.value, gap));
  const range = computed(() => getVirtualGridRange(
    items.value.length,
    columnCount.value,
    Math.max(minRowHeight, rowHeight.value),
    scrollTop.value,
    viewportHeight.value,
    overscanRows,
  ));
  const visibleItems = computed(() => items.value.slice(range.value.startIndex, range.value.endIndex));

  let containerResizeObserver: ResizeObserver | null = null;
  let rowResizeObserver: ResizeObserver | null = null;
  let observedRowElement: Element | null = null;

  const updateContainerMetrics = (element: HTMLElement | null = containerRef.value) => {
    if (!element) return;
    containerWidth.value = element.clientWidth;
    viewportHeight.value = element.clientHeight;
  };

  const setScrollTop = (nextScrollTop: number) => {
    scrollTop.value = Number.isFinite(nextScrollTop) && nextScrollTop > 0 ? nextScrollTop : 0;
  };

  const observeRowElement = (element: Element | null) => {
    if (!element || element === observedRowElement || typeof ResizeObserver === 'undefined') return;
    rowResizeObserver?.disconnect();
    observedRowElement = element;
    rowResizeObserver = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect.height ?? 0;
      if (height > 0) measuredRowHeight.value = Math.max(minRowHeight, Math.ceil(height + gap));
    });
    rowResizeObserver.observe(element);
  };

  const resetMeasuredRowHeight = () => {
    measuredRowHeight.value = null;
  };

  onMounted(() => {
    const element = containerRef.value;
    if (!element) return;
    updateContainerMetrics(element);
    if (typeof ResizeObserver !== 'undefined') {
      containerResizeObserver = new ResizeObserver(() => {
        const previousWidth = containerWidth.value;
        updateContainerMetrics(element);
        if (previousWidth !== containerWidth.value) resetMeasuredRowHeight();
      });
      containerResizeObserver.observe(element);
    }
  });

  onUnmounted(() => {
    containerResizeObserver?.disconnect();
    rowResizeObserver?.disconnect();
    containerResizeObserver = null;
    rowResizeObserver = null;
    observedRowElement = null;
  });

  return {
    columnCount,
    rowHeight,
    viewportHeight,
    scrollTop,
    range,
    visibleItems,
    topSpacerHeight: computed(() => range.value.topSpacerHeight),
    bottomSpacerHeight: computed(() => range.value.bottomSpacerHeight),
    setScrollTop,
    updateContainerMetrics,
    observeRowElement,
    resetMeasuredRowHeight,
  };
}
