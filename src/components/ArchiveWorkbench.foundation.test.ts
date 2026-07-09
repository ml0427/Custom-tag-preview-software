import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Archive Workbench foundation', () => {
  const themes = readFileSync(new URL('../themes.css', import.meta.url), 'utf8');
  const globalStyle = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const iconUrl = new URL('./AppIcon.vue', import.meta.url);
  const icon = existsSync(iconUrl) ? readFileSync(iconUrl, 'utf8') : '';

  it('defines semantic workbench tokens', () => {
    for (const token of [
      '--surface-canvas',
      '--surface-panel',
      '--surface-raised',
      '--line-default',
      '--content-primary',
      '--control-height-md',
      '--panel-gap',
    ]) {
      expect(themes).toContain(token);
    }
  });

  it('provides a reusable currentColor icon renderer', () => {
    expect(icon).toContain('export type AppIconName');
    expect(icon).toContain('currentColor');
    expect(icon).toContain('aria-hidden="true"');
  });

  it('uses a visible keyboard focus primitive', () => {
    expect(globalStyle).toContain(':focus-visible');
    expect(globalStyle).toContain('var(--ring-focus)');
  });
});
