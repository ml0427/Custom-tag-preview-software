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
  pageCount: 20,
  ...overrides,
});

describe('reader wheel navigation', () => {
  it('accumulates small downward wheel deltas before moving the target page', () => {
    const state = createReaderWheelState(4);

    const first = resolveReaderWheelNavigation(baseInput(state, { deltaY: 30 }));
    expect(first.changed).toBe(false);
    expect(first.targetPageIndex).toBe(4);
    expect(first.state.accumulatedDeltaY).toBe(30);

    const second = resolveReaderWheelNavigation(baseInput(first.state, { deltaY: 50 }));
    expect(second.changed).toBe(true);
    expect(second.targetPageIndex).toBe(5);
    expect(second.state.targetPageIndex).toBe(5);
    expect(second.state.accumulatedDeltaY).toBe(8);
  });

  it('resets accumulated movement when wheel direction changes', () => {
    const state = resolveReaderWheelNavigation(baseInput(createReaderWheelState(4), { deltaY: 40 })).state;

    const result = resolveReaderWheelNavigation(baseInput(state, { deltaY: -50 }));

    expect(result.changed).toBe(false);
    expect(result.targetPageIndex).toBe(4);
    expect(result.state.accumulatedDeltaY).toBe(-50);
  });

  it('moves multiple target pages for a large wheel delta', () => {
    const result = resolveReaderWheelNavigation(baseInput(createReaderWheelState(4), { deltaY: 220 }));

    expect(result.changed).toBe(true);
    expect(result.targetPageIndex).toBe(7);
    expect(result.state.accumulatedDeltaY).toBe(4);
  });

  it('clamps target pages to the first and last page boundaries', () => {
    const firstPage = resolveReaderWheelNavigation(baseInput(createReaderWheelState(0), {
      deltaY: -90,
    }));
    const lastPage = resolveReaderWheelNavigation(baseInput(createReaderWheelState(19), {
      deltaY: 90,
    }));

    expect(firstPage.changed).toBe(false);
    expect(firstPage.targetPageIndex).toBe(0);
    expect(firstPage.state.accumulatedDeltaY).toBe(0);
    expect(lastPage.changed).toBe(false);
    expect(lastPage.targetPageIndex).toBe(19);
    expect(lastPage.state.accumulatedDeltaY).toBe(0);
  });

  it('normalizes line-mode wheel events before applying the threshold', () => {
    const result = resolveReaderWheelNavigation(baseInput(createReaderWheelState(4), {
      deltaY: 5,
      deltaMode: 1,
    }));

    expect(result.changed).toBe(true);
    expect(result.targetPageIndex).toBe(5);
  });
});
