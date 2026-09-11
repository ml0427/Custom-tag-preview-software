import { beforeEach, describe, expect, it, vi } from 'vitest';

const onBeforeUnmountMock = vi.hoisted(() => vi.fn());

vi.mock('vue', async importOriginal => {
  const actual = await importOriginal<typeof import('vue')>();
  return { ...actual, onBeforeUnmount: onBeforeUnmountMock };
});

import { useGalleryPreviewResize } from './useGalleryPreviewResize';

type MouseListener = (event: MouseEvent) => void;

const listeners = new Map<string, EventListener>();
const documentStub = {
  body: { style: { cursor: '', userSelect: '' } },
  addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (typeof listener === 'function') listeners.set(type, listener);
  }),
  removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (listeners.get(type) === listener) listeners.delete(type);
  }),
};

describe('useGalleryPreviewResize', () => {
  beforeEach(() => {
    listeners.clear();
    onBeforeUnmountMock.mockReset();
    documentStub.body.style.cursor = '';
    documentStub.body.style.userSelect = '';
    documentStub.addEventListener.mockClear();
    documentStub.removeEventListener.mockClear();
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('window', { innerWidth: 1000 });
  });

  it('tracks resizing and constrains the preview width while dragging', () => {
    const { isResizing, previewWidth, startResizing, stopResizing } = useGalleryPreviewResize();

    expect(isResizing.value).toBe(false);
    expect(previewWidth.value).toBe(300);
    startResizing();
    expect(isResizing.value).toBe(true);
    expect(documentStub.body.style.cursor).toBe('col-resize');

    (listeners.get('mousemove') as MouseListener | undefined)?.({ clientX: 750 } as MouseEvent);
    expect(previewWidth.value).toBe(250);

    (listeners.get('mousemove') as MouseListener | undefined)?.({ clientX: 100 } as MouseEvent);
    expect(previewWidth.value).toBe(250);

    stopResizing();
    expect(isResizing.value).toBe(false);
    expect(listeners.size).toBe(0);
    expect(documentStub.body.style.cursor).toBe('');
    expect(documentStub.body.style.userSelect).toBe('');
  });

  it('cleans up the active drag when the component unmounts', () => {
    const { isResizing, startResizing } = useGalleryPreviewResize();
    const cleanup = onBeforeUnmountMock.mock.calls[0]?.[0] as (() => void) | undefined;

    expect(cleanup).toBeTypeOf('function');
    startResizing();
    cleanup?.();

    expect(isResizing.value).toBe(false);
    expect(listeners.size).toBe(0);
    expect(documentStub.body.style.cursor).toBe('');
    expect(documentStub.body.style.userSelect).toBe('');
  });
});
