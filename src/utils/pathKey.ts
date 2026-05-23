export const pathKey = (path: string) =>
  path
    .toLowerCase()
    .replace(/\//g, '\\')
    .replace(/\\+/g, '\\')
    .replace(/\\$/, '');
