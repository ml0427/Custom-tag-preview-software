import { describe, expect, it, vi } from 'vitest';
import type { ScanPreviewItem, TagRuleInput } from '../api';
import { applyReviewedScanPlan, scanPlanHasChanges } from './scanPlan';

describe('applyReviewedScanPlan', () => {
  it('recognizes whether a plan changes anything', () => {
    const unchanged: ScanPreviewItem = {
      path: 'C:/Library/book.zip', name: 'book.zip', isDir: false,
      proposedTags: ['comic'], addedTags: [], removedTags: [], isNew: false, snapshot: 'snapshot-1',
    };
    expect(scanPlanHasChanges([unchanged])).toBe(false);
    expect(scanPlanHasChanges([{ ...unchanged, addedTags: ['new'] }])).toBe(true);
    expect(scanPlanHasChanges([{ ...unchanged, isNew: true }])).toBe(true);
  });

  it('passes the reviewed plan to applyTagScan without saving rules separately', async () => {
    const expectedPlan: ScanPreviewItem[] = [{
      path: 'C:/Library/new.zip',
      name: 'new.zip',
      isDir: false,
      proposedTags: ['comic'],
      addedTags: ['comic'],
      removedTags: [],
      isNew: true,
      snapshot: 'snapshot-1',
    }];
    const rules: TagRuleInput[] = [{ name: 'comic', matchType: 'contains', pattern: 'comic', tagName: 'comic' }];
    const applyTagScan = vi.fn().mockResolvedValue({ added: 1, updated: 0, removed: 0, tagged: 1 });
    const client = { applyTagScan };

    await expect(applyReviewedScanPlan(client, 'C:/Library', rules, expectedPlan)).resolves.toEqual({
      added: 1,
      updated: 0,
      removed: 0,
      tagged: 1,
    });
    expect(applyTagScan).toHaveBeenCalledWith('C:/Library', rules, expectedPlan);
    expect(client).not.toHaveProperty('saveTagRules');
  });
});
