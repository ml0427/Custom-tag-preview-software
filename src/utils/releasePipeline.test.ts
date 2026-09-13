import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

let fixture: string
const read = (file: string) => readFileSync(join(fixture, file), 'utf8')
const run = (script: string, args: string[], env: Record<string, string> = {}) => spawnSync(process.execPath,
  [join(fixture, 'scripts', script), ...args], {
    cwd: fixture, encoding: 'utf8', env: { ...process.env, GITHUB_REF_TYPE: '', GITHUB_REF_NAME: '', ...env },
  })

describe('release pipeline guards', () => {
  beforeEach(() => {
    fixture = mkdtempSync(join(tmpdir(), 'ctp-release-test-'))
    for (const file of ['scripts/release-version.cjs', 'scripts/stamp-build.cjs', 'scripts/validate-update-manifest.cjs',
      'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'package.json', 'package-lock.json', 'index.html']) {
      cpSync(resolve(file), join(fixture, file), { recursive: true })
    }
  })
  afterEach(() => rmSync(fixture, { recursive: true, force: true }))

  it('synchronizes three-part versions and retains the stamp on repeated builds', () => {
    expect(run('release-version.cjs', ['0.147.1']).status).toBe(0)
    expect(run('release-version.cjs', ['--check']).status).toBe(0)
    expect(read('index.html')).toContain('Custom Tag Preview v0.147.1 · ')
    const before = read('src-tauri/tauri.conf.json')
    expect(run('stamp-build.cjs', []).status).toBe(0)
    expect(read('src-tauri/tauri.conf.json')).toBe(before)
  })

  it('rejects a mismatched release tag and accepts the exact version tag', () => {
    const version = JSON.parse(read('src-tauri/tauri.conf.json')).version as string
    expect(run('release-version.cjs', ['--check'], { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.0' }).status).not.toBe(0)
    expect(run('release-version.cjs', ['--check'], { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: `v${version}` }).status).toBe(0)
  })

  it('rejects an out-of-sync package version', () => {
    const pkg = JSON.parse(read('package.json'))
    pkg.version = '0.1.0'
    writeFileSync(join(fixture, 'package.json'), JSON.stringify(pkg))
    expect(run('release-version.cjs', ['--check']).status).not.toBe(0)
  })

  it('rejects invalid or prerelease versions without changing files', () => {
    const before = read('src-tauri/tauri.conf.json')
    for (const version of ['v0.147', '0.147.0-beta.1', 'wrong']) {
      expect(run('release-version.cjs', [version]).status).not.toBe(0)
      expect(read('src-tauri/tauri.conf.json')).toBe(before)
    }
  })

  it('only accepts a manifest for the signed Windows installer of this version', () => {
    const version = JSON.parse(read('src-tauri/tauri.conf.json')).version as string
    const platform = { signature: 'signed-content',
      url: `https://github.com/ml0427/Custom-tag-preview-software/releases/download/v${version}/comic-manager_${version}_x64-setup.exe` }
    const manifest = { version, platforms: { 'windows-x86_64': platform } }
    const validate = (value: unknown) => {
      writeFileSync(join(fixture, 'latest.json'), JSON.stringify(value))
      return run('validate-update-manifest.cjs', ['latest.json']).status
    }
    expect(validate(manifest)).toBe(0)
    expect(validate({ ...manifest, version: '0.1.0' })).not.toBe(0)
    expect(validate({ ...manifest, platforms: {} })).not.toBe(0)
    expect(validate({ ...manifest, platforms: { 'windows-x86_64': { ...platform, signature: '' } } })).not.toBe(0)
    expect(validate({ ...manifest, platforms: { 'windows-x86_64': { ...platform, url: 'https://example.com/setup.exe' } } })).not.toBe(0)
  })
})
