export const pathKey = (path: string) =>
  path
    .normalize('NFKC')            // 全形/半形、相容字元正規化（處理 ～→~、【→[ 等）
    .toLowerCase()
    .replace(/\//g, '\\')
    .replace(/\\+/g, '\\')        // 合併連續反斜線
    .replace(/\\$/, '');          // 去除尾端反斜線
