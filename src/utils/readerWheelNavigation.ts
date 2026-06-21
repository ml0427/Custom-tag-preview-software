export type ReaderWheelDirection = 'previous' | 'next';

export type ReaderWheelState = {
  accumulatedDeltaY: number;
  lastDirection: ReaderWheelDirection | null;
  lastNavigationAt: number;
};

type ResolveReaderWheelNavigationInput = {
  state: ReaderWheelState;
  deltaY: number;
  deltaMode: number;
  now: number;
  isLoading: boolean;
  isAtFirstPage: boolean;
  isAtLastPage: boolean;
  threshold?: number;
  cooldownMs?: number;
};

type ResolveReaderWheelNavigationResult = {
  direction: ReaderWheelDirection | null;
  state: ReaderWheelState;
};

const DEFAULT_THRESHOLD = 72;
const DEFAULT_COOLDOWN_MS = 320;
const LINE_DELTA_MULTIPLIER = 16;
const PAGE_DELTA_MULTIPLIER = 480;

export const createReaderWheelState = (): ReaderWheelState => ({
  accumulatedDeltaY: 0,
  lastDirection: null,
  lastNavigationAt: Number.NEGATIVE_INFINITY,
});

const resetAccumulation = (state: ReaderWheelState): ReaderWheelState => ({
  ...state,
  accumulatedDeltaY: 0,
  lastDirection: null,
});

const normalizeDeltaY = (deltaY: number, deltaMode: number) => {
  if (deltaMode === 1) return deltaY * LINE_DELTA_MULTIPLIER;
  if (deltaMode === 2) return deltaY * PAGE_DELTA_MULTIPLIER;
  return deltaY;
};

export const resolveReaderWheelNavigation = ({
  state,
  deltaY,
  deltaMode,
  now,
  isLoading,
  isAtFirstPage,
  isAtLastPage,
  threshold = DEFAULT_THRESHOLD,
  cooldownMs = DEFAULT_COOLDOWN_MS,
}: ResolveReaderWheelNavigationInput): ResolveReaderWheelNavigationResult => {
  const normalizedDeltaY = normalizeDeltaY(deltaY, deltaMode);
  if (!Number.isFinite(normalizedDeltaY) || normalizedDeltaY === 0) {
    return { direction: null, state };
  }

  const direction: ReaderWheelDirection = normalizedDeltaY > 0 ? 'next' : 'previous';
  const isBlocked =
    isLoading
    || (direction === 'previous' && isAtFirstPage)
    || (direction === 'next' && isAtLastPage);

  if (isBlocked || now - state.lastNavigationAt < cooldownMs) {
    return { direction: null, state: resetAccumulation(state) };
  }

  const accumulatedDeltaY = state.lastDirection === direction
    ? state.accumulatedDeltaY + normalizedDeltaY
    : normalizedDeltaY;

  if (Math.abs(accumulatedDeltaY) < threshold) {
    return {
      direction: null,
      state: {
        ...state,
        accumulatedDeltaY,
        lastDirection: direction,
      },
    };
  }

  return {
    direction,
    state: {
      accumulatedDeltaY: 0,
      lastDirection: direction,
      lastNavigationAt: now,
    },
  };
};
