import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import type { ScanPreviewItem } from '../api';
import ScanPreviewList from './ScanPreviewList.vue';

const renderPreview = (previewItems: ScanPreviewItem[]) => renderToString(createSSRApp(ScanPreviewList, {
  previewItems,
  isLoading: false,
}));

describe('ScanPreviewList', () => {
  it('renders new tracking and added/removed tag changes', async () => {
    const html = await renderPreview([{
      path: 'C:/Library/new.zip',
      name: 'new.zip',
      isDir: false,
      proposedTags: ['comic', 'new-tag'],
      addedTags: ['new-tag'],
      removedTags: ['old-tag'],
      isNew: true,
      snapshot: 'snapshot-1',
    }]);

    expect(html).toContain('新追蹤');
    expect(html).toContain('＋new-tag');
    expect(html).toContain('－old-tag');
  });

  it('renders the empty state when no items match', async () => {
    const html = await renderPreview([]);
    expect(html).toContain('沒有項目符合規則');
  });
});
