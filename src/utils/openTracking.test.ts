import { describe, expect, it, vi } from 'vitest';
import { openFileAndRecord, recordOpenForPath } from './openTracking';

describe('openTracking', () => {
  it('records after a successful system open', async () => {
    const openFile = vi.fn().mockResolvedValue(undefined);
    const recordOpen = vi.fn().mockResolvedValue(undefined);

    await openFileAndRecord('C:/Library/book.zip', openFile, recordOpen);

    expect(openFile).toHaveBeenCalledWith('C:/Library/book.zip');
    expect(recordOpen).toHaveBeenCalledWith('C:/Library/book.zip');
    expect(openFile.mock.invocationCallOrder[0]).toBeLessThan(recordOpen.mock.invocationCallOrder[0]);
  });

  it('does not record when system open fails', async () => {
    const openFileError = new Error('cannot open');
    const openFile = vi.fn().mockRejectedValue(openFileError);
    const recordOpen = vi.fn().mockResolvedValue(undefined);

    await expect(openFileAndRecord('C:/Library/book.zip', openFile, recordOpen)).rejects.toThrow('cannot open');

    expect(recordOpen).not.toHaveBeenCalled();
  });

  it('does not reject when recording fails after a successful open', async () => {
    const openFile = vi.fn().mockResolvedValue(undefined);
    const recordOpen = vi.fn().mockRejectedValue(new Error('db busy'));
    const onRecordError = vi.fn();

    await expect(
      openFileAndRecord('C:/Library/book.zip', openFile, recordOpen, onRecordError),
    ).resolves.toBeUndefined();

    expect(onRecordError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('records a successful reader open without throwing record errors', async () => {
    const recordOpen = vi.fn().mockRejectedValue(new Error('db busy'));
    const onRecordError = vi.fn();

    await expect(
      recordOpenForPath('C:/Library/book.zip', recordOpen, onRecordError),
    ).resolves.toBeUndefined();

    expect(recordOpen).toHaveBeenCalledWith('C:/Library/book.zip');
    expect(onRecordError).toHaveBeenCalledWith(expect.any(Error));
  });
});
