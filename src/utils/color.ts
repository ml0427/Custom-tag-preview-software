/**
 * 將顏色字串正規化為 canonical 形式 `#rrggbb`（小寫）。
 *
 * 接受：`#rgb`、`#rrggbb`、`rgb`、`rrggbb`（有無 `#` 皆可，大小寫不限）。
 * 拒絕：`rgb(...)`、`hsl(...)`、命名色（`red`）、含 alpha 的 `#rrggbbaa`、空白、其他格式。
 *
 * 必須在所有 hex alpha 字串拼接（如 `${color}22`）之前呼叫，否則 3 碼縮寫
 * 或 `rgb(...)` 會產生無效 CSS 並導致破版。
 */
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = String(input).trim().toLowerCase().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return '#' + hex;
}

/**
 * 判斷字串是否已是 canonical `#rrggbb` 格式（可直接拼接 hex alpha 後綴）。
 */
export function isCanonicalHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value);
}
