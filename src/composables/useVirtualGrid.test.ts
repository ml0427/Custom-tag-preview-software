import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID_INFO_HEIGHT,
  getEvenColumnCount,
  getEstimatedRowHeight,
  getVirtualGridRange,
} from './useVirtualGrid';

describe('useVirtualGrid helpers', () => {
  it('keeps responsive column counts even and aligned with the grid breakpoints', () => {
    expect([0, 641, 642, 969, 970, 1298, 1626, 1954].map(getEvenColumnCount))
      .toEqual([2, 2, 4, 4, 6, 8, 10, 12]);
  });

  it('renders a bounded overscanned window for a 10,000 item collection', () => {
    const range = getVirtualGridRange(10_000, 8, 320, 120_000, 900, 2);

    expect(range.totalRows).toBe(1_250);
    expect(range.startIndex).toBe(2_984);
    expect(range.endIndex).toBe(3_040);
    expect(range.endIndex - range.startIndex).toBeLessThanOrEqual(64);
    expect(range.topSpacerHeight).toBe(range.startRow * 320);
    expect(range.bottomSpacerHeight).toBe((range.totalRows - range.endRow) * 320);
  });

  it('clamps a restored scroll position when the list becomes shorter', () => {
    const range = getVirtualGridRange(3, 2, 320, 120_000, 900, 2);

    expect(range.startRow).toBe(0);
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(3);
    expect(range.topSpacerHeight).toBe(0);
  });

  it('estimates a positive row pitch from the measured container width', () => {
    expect(getEstimatedRowHeight(1200, 6)).toBeGreaterThan(220);
    expect(getEstimatedRowHeight(0, 2)).toBe(220);
  });

  it('uses the compact card metadata height when estimating the row pitch', () => {
    const gap = 14;
    const cardWidth = (642 - gap * 3) / 4;
    expect(getEstimatedRowHeight(642, 4, gap))
      .toBe(Math.ceil(cardWidth * 4 / 3 + DEFAULT_GRID_INFO_HEIGHT + gap));
  });
});
