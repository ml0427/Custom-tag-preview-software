const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const env = { ...process.env };
const localKey = path.join(os.homedir(), '.tauri', 'custom-tag-preview', 'updater.key');
if (!env.TAURI_SIGNING_PRIVATE_KEY && fs.existsSync(localKey)) {
  env.TAURI_SIGNING_PRIVATE_KEY = localKey;
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
}
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
  'build', ...process.argv.slice(2),
], { cwd: root, env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
