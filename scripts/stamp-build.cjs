const fs = require('fs');
const path = require('path');

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
const stamp = `${dateStr} ${timeStr}`;

const root = path.join(__dirname, '..');
const tauriConfPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const indexPath = path.join(root, 'index.html');

// Tauri 的套件版本是更新與顯示版本的唯一來源。
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
const currentTitle = tauriConf.app.windows[0].title;
const prefix = `Custom Tag Preview v${tauriConf.version}`;
const force = process.argv.includes('--force') || process.env.FORCE_BUILD_STAMP === '1';

const newTitle = !force && currentTitle.startsWith(`${prefix} · `)
  ? currentTitle : `${prefix} · ${stamp}`;

// 更新 tauri.conf.json
tauriConf.app.windows[0].title = newTitle;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

// 更新 index.html
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/<title>.*?<\/title>/, `<title>${newTitle}</title>`);
fs.writeFileSync(indexPath, html);

console.log(`✅ 標題已更新：${newTitle}`);
