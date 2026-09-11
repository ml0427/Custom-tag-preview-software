import type { ScanPreviewItem, TagRuleInput } from '../api';

export interface ScanPlanApi {
  applyTagScan: (
    scopePath: string,
    rules: TagRuleInput[],
    expectedPlan: ScanPreviewItem[],
  ) => Promise<{ added: number; updated: number; removed: number; tagged: number }>;
}

export const scanPlanHasChanges = (items: ScanPreviewItem[]): boolean => items.some(item => (
  item.isNew || item.addedTags.length > 0 || item.removedTags.length > 0
));

/** Apply exactly the plan the user reviewed; the backend rechecks its snapshot. */
export const applyReviewedScanPlan = (
  client: ScanPlanApi,
  scopePath: string,
  rules: TagRuleInput[],
  expectedPlan: ScanPreviewItem[],
) => client.applyTagScan(scopePath, rules, expectedPlan);
