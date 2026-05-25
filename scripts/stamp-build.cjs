const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
const stamp = `${dateStr} ${timeStr}`;

const root = path.join(__dirname, '..');
const tauriConfPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const indexPath = path.join(root, 'index.html');

const titlePattern = /(Custom Tag Preview )(v\d+\.\d+)(?: · ([^<"]+))?/;

function parseTitle(title) {
  const match = title.match(titlePattern);
  return {
    version: match ? match[2] : 'v0.1',
    stamp: match?.[3] ?? '',
  };
}

function readHeadTitle() {
  try {
    const headConf = execSync('git show HEAD:src-tauri/tauri.conf.json', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(headConf).app.windows[0].title;
  } catch {
    return null;
  }
}

// 從現有標題抓版號
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
const currentTitle = tauriConf.app.windows[0].title;
const current = parseTitle(currentTitle);
const headTitle = readHeadTitle();
const head = headTitle ? parseTitle(headTitle) : null;
const force = process.argv.includes('--force') || process.env.FORCE_BUILD_STAMP === '1';

if (!force && head && (current.version === head.version || current.stamp !== head.stamp)) {
  console.log(`⏭️ 標題時間戳未更新：${currentTitle}`);
  process.exit(0);
}

const newTitle = `Custom Tag Preview ${current.version} · ${stamp}`;

// 更新 tauri.conf.json
tauriConf.app.windows[0].title = newTitle;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

// 更新 index.html
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/<title>.*?<\/title>/, `<title>${newTitle}</title>`);
fs.writeFileSync(indexPath, html);

console.log(`✅ 標題已更新：${newTitle}`);
