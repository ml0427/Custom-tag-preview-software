/**
 * 智能標籤分割：支援 []【】括號剝除、()（）括號展開、、，分隔符。
 * 例：[Armadillo (練慈、大慈)] → ['Armadillo', '練慈', '大慈']
 */
export function splitTagInput(input: string): string[] {
    let text = input.trim();
    if ((text.startsWith('[') && text.endsWith(']')) ||
        (text.startsWith('【') && text.endsWith('】'))) {
        text = text.slice(1, -1).trim();
    }

    const parts: string[] = [];
    const parenRe = /\(([^)]*)\)|（([^）]*)）/g;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = parenRe.exec(text)) !== null) {
        const before = text.slice(last, m.index).trim();
        if (before) parts.push(...before.split(/[、，,]/).map(s => s.trim()).filter(Boolean));
        const inner = (m[1] ?? m[2] ?? '').trim();
        if (inner) parts.push(...inner.split(/[、，,]/).map(s => s.trim()).filter(Boolean));
        last = m.index + m[0].length;
    }

    const tail = text.slice(last).trim();
    if (tail) parts.push(...tail.split(/[、，,]/).map(s => s.trim()).filter(Boolean));

    return parts;
}
