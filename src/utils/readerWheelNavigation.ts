export type ReaderWheelDirection = 'previous' | 'next';

export type ReaderWheelState = {
  accumulatedDeltaY: number;
  lastDirection: ReaderWheelDirection | null;
  targetPageIndex: number;
};

type ResolveReaderWheelNavigationInput = {
  state: ReaderWheelState;
  deltaY: number;
  deltaMode: number;
  pageCount: number;
  threshold?: number;
};

type ResolveReaderWheelNavigationResult = {
  changed: boolean;
  targetPageIndex: number;
  state: ReaderWheelState;
};

const DEFAULT_THRESHOLD = 72;
const LINE_DELTA_MULTIPLIER = 16;
const PAGE_DELTA_MULTIPLIER = 480;

export const createReaderWheelState = (targetPageIndex = 0): ReaderWheelState => ({
  accumulatedDeltaY: 0,
  lastDirection: null,
  targetPageIndex,
});

const normalizeDeltaY = (deltaY: number, deltaMode: number) => {
  if (deltaMode === 1) return deltaY * LINE_DELTA_MULTIPLIER;
  if (deltaMode === 2) return deltaY * PAGE_DELTA_MULTIPLIER;
  return deltaY;
};

const clampPageIndex = (pageIndex: number, pageCount: number) =>
  Math.min(Math.max(pageIndex, 0), Math.max(pageCount - 1, 0));

export const resolveReaderWheelNavigation = ({
  state,
  deltaY,
  deltaMode,
  pageCount,
  threshold = DEFAULT_THRESHOLD,
}: ResolveReaderWheelNavigationInput): ResolveReaderWheelNavigationResult => {
  const normalizedDeltaY = normalizeDeltaY(deltaY, deltaMode);
  const currentTargetPageIndex = clampPageIndex(state.targetPageIndex, pageCount);
  const unchanged = (nextState = state): ResolveReaderWheelNavigationResult => ({
    changed: false,
    targetPageIndex: currentTargetPageIndex,
    state: nextState,
  });

  if (pageCount <= 0 || !Number.isFinite(normalizedDeltaY) || normalizedDeltaY === 0) {
    return unchanged({ ...state, targetPageIndex: currentTargetPageIndex });
  }

  const direction: ReaderWheelDirection = normalizedDeltaY > 0 ? 'next' : 'previous';
  const accumulatedDeltaY = state.lastDirection === direction
    ? state.accumulatedDeltaY + normalizedDeltaY
    : normalizedDeltaY;

  if (Math.abs(accumulatedDeltaY) < threshold) {
    return unchanged({
      accumulatedDeltaY,
      lastDirection: direction,
      targetPageIndex: currentTargetPageIndex,
    });
  }

  const pageStep = Math.trunc(Math.abs(accumulatedDeltaY) / threshold);
  const pageDelta = direction === 'next' ? pageStep : -pageStep;
  const targetPageIndex = clampPageIndex(currentTargetPageIndex + pageDelta, pageCount);
  const changed = targetPageIndex !== currentTargetPageIndex;
  const leftoverDelta = changed
    ? Math.sign(accumulatedDeltaY) * (Math.abs(accumulatedDeltaY) % threshold)
    : 0;

  return {
    changed,
    targetPageIndex,
    state: {
      accumulatedDeltaY: leftoverDelta,
      lastDirection: direction,
      targetPageIndex,
    },
  };
};
