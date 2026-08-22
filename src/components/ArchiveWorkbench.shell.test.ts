import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Archive Workbench application shell', () => {
  const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
  const rail = readFileSync(new URL('./ActivityBar.vue', import.meta.url), 'utf8');

  it('renders named shell regions', () => {
    expect(app).toContain('class="app-shell"');
    expect(app).toContain('class="context-sidebar"');
    expect(app).toContain('class="content-stage"');
  });

  it('starts in the workspace with the Library sidebar collapsed', () => {
    expect(app).toContain("const activePanel = ref<string | null>(null)");
    expect(app).toContain("!activePanel && lastMainView === 'workspace'");
    expect(app).toContain('const sources = await api.getSources()');
    expect(app).toContain('selectedSourcePath.value = sources[0].path');
    expect(app).toContain('loadInitialSource()');
  });

  it('gives primary destinations visible labels', () => {
    for (const label of ['工作目錄', '標籤', '健檢', '設定']) {
      expect(rail).toContain(label);
    }
    expect(rail).toContain('<AppIcon');
    expect(rail).toContain('aria-label="主要導覽"');
  });
});
