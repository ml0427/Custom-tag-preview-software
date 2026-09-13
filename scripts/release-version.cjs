const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const cargo = read('src-tauri/Cargo.toml');
const cargoLock = read('src-tauri/Cargo.lock');
const cargoPattern = /(\[{1,2}package\]{1,2}\s+name = "app"\s+version = ")([^"]+)(")/;
const version = process.argv[2];

if (version === '--check') {
  const expected = config.version;
  const versions = [pkg.version, lock.version, lock.packages[''].version,
    cargo.match(cargoPattern)?.[2], cargoLock.match(cargoPattern)?.[2]];
  if (!/^\d+\.\d+\.\d+$/.test(expected) || versions.some(value => value !== expected)) {
    throw new Error(`版本不一致，請執行 npm run version:set -- <版本>。Tauri=${expected}，其他=${versions.join(', ')}`);
  }
  const titlePrefix = `Custom Tag Preview v${expected} · `;
  if (!config.app.windows[0].title.startsWith(titlePrefix) || !read('index.html').includes(`<title>${titlePrefix}`)) {
    throw new Error('視窗標題版本不一致，請執行 npm run stamp-build');
  }
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${expected}`) {
    throw new Error(`Git tag 必須是 v${expected}`);
  }
  console.log(`版本一致：${expected}`);
} else {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('請提供正式版本號，例如 0.147.0');
  if (!cargoPattern.test(cargo) || !cargoPattern.test(cargoLock)) throw new Error('找不到 app 的 Cargo 版本，未寫入任何檔案');
  config.version = pkg.version = lock.version = lock.packages[''].version = version;
  write('src-tauri/tauri.conf.json', JSON.stringify(config, null, 2) + '\n');
  write('package.json', JSON.stringify(pkg, null, 2) + '\n');
  write('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
  write('src-tauri/Cargo.toml', cargo.replace(cargoPattern, (_, before, _old, after) => `${before}${version}${after}`));
  write('src-tauri/Cargo.lock', cargoLock.replace(cargoPattern, (_, before, _old, after) => `${before}${version}${after}`));
  require('./stamp-build.cjs');
  console.log(`版本已同步：${version}`);
}
