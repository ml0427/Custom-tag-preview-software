import { describe, expect, it } from 'vitest';
import {
  createReaderWheelState,
  resolveReaderWheelNavigation,
  type ReaderWheelState,
} from './readerWheelNavigation';

const baseInput = (state: ReaderWheelState, overrides = {}) => ({
  state,
  deltaY: 0,
  deltaMode: 0,
  now: 1000,
  isLoading: false,
  isAtFirstPage: false,
  isAtLastPage: false,
  ...overrides,
});

describe('reader wheel navigation', () => {
  it('accumulates small downward wheel deltas before moving to the next page', () => {
    let state = createReaderWheelState();

    const first = resolveReaderWheelNavigation(baseInput(state, { deltaY: 30 }));
    expect(first.direction).toBeNull();
    expect(first.state.accumulatedDeltaY).toBe(30);

    const second = resolveReaderWheelNavigation(baseInput(first.state, { deltaY: 50, now: 1040 }));
    expect(second.direction).toBe('next');
    expect(second.state.accumulatedDeltaY).toBe(0);
    expect(second.state.lastNavigationAt).toBe(1040);
  });

  it('resets accumulated movement when wheel direction changes', () => {
    const state = resolveReaderWheelNavigation(baseInput(createReaderWheelState(), { deltaY: 40 })).state;

    const result = resolveReaderWheelNavigation(baseInput(state, { deltaY: -50, now: 1020 }));

    expect(result.direction).toBeNull();
    expect(result.state.accumulatedDeltaY).toBe(-50);
  });

  it('blocks repeated page turns during the cooldown window', () => {
    const first = resolveReaderWheelNavigation(baseInput(createReaderWheelState(), { deltaY: 90, now: 1000 }));

    const second = resolveReaderWheelNavigation(baseInput(first.state, { deltaY: 90, now: 1100 }));

    expect(first.direction).toBe('next');
    expect(second.direction).toBeNull();
    expect(second.state.accumulatedDeltaY).toBe(0);
    expect(second.state.lastNavigationAt).toBe(1000);
  });

  it('does not navigate while loading or past page boundaries', () => {
    const loading = resolveReaderWheelNavigation(baseInput(createReaderWheelState(), {
      deltaY: 90,
      isLoading: true,
    }));
    const firstPage = resolveReaderWheelNavigation(baseInput(createReaderWheelState(), {
      deltaY: -90,
      isAtFirstPage: true,
    }));
    const lastPage = resolveReaderWheelNavigation(baseInput(createReaderWheelState(), {
      deltaY: 90,
      isAtLastPage: true,
    }));

    expect(loading.direction).toBeNull();
    expect(firstPage.direction).toBeNull();
    expect(lastPage.direction).toBeNull();
  });

  it('normalizes line-mode wheel events before applying the threshold', () => {
    const result = resolveReaderWheelNavigation(baseInput(createReaderWheelState(), {
      deltaY: 5,
      deltaMode: 1,
    }));

    expect(result.direction).toBe('next');
  });
});
