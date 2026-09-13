const fs = require('node:fs');
const config = require('../src-tauri/tauri.conf.json');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const platform = manifest.platforms?.['windows-x86_64'];
const expectedPrefix = `https://github.com/ml0427/Custom-tag-preview-software/releases/download/v${config.version}/`;
if (manifest.version?.replace(/^v/, '') !== config.version || !platform?.signature?.trim() ||
    !platform?.url?.startsWith(expectedPrefix) || !platform.url.endsWith('-setup.exe')) {
  throw new Error('更新清單缺少正確的版本、Windows NSIS 安裝包網址或簽章，停止發佈');
}
console.log(`更新清單已確認：${manifest.version} / windows-x86_64`);
