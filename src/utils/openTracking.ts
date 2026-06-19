type OpenFile = (path: string) => Promise<void>;
type RecordOpen = (path: string) => Promise<void>;
type RecordErrorHandler = (error: unknown) => void;

const defaultRecordErrorHandler: RecordErrorHandler = error => {
  console.error('record item open failed', error);
};

export const recordOpenForPath = async (
  path: string,
  recordOpen: RecordOpen,
  onRecordError: RecordErrorHandler = defaultRecordErrorHandler,
): Promise<void> => {
  try {
    await recordOpen(path);
  } catch (error) {
    onRecordError(error);
  }
};

export const openFileAndRecord = async (
  path: string,
  openFile: OpenFile,
  recordOpen: RecordOpen,
  onRecordError?: RecordErrorHandler,
): Promise<void> => {
  await openFile(path);
  await recordOpenForPath(path, recordOpen, onRecordError);
};
