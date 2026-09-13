import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater'

const native = vi.hoisted(() => ({ check: vi.fn(), relaunch: vi.fn(), isTauri: vi.fn(), getVersion: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: native.isTauri }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: native.getVersion }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: native.check }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: native.relaunch }))

let storage: Map<string, string>
const makeUpdate = () => ({
  version: '0.147.0', body: '新版內容', close: vi.fn().mockResolvedValue(undefined),
  downloadAndInstall: vi.fn().mockResolvedValue(undefined),
})
const load = async () => (await import('./useAppUpdater')).useAppUpdater()

describe('app updater', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubEnv('DEV', false)
    storage = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    })
    native.isTauri.mockReturnValue(true)
    native.getVersion.mockResolvedValue('0.146.0')
    native.check.mockResolvedValue(null)
    native.relaunch.mockResolvedValue(undefined)
  })

  it('only announces an available update; never installs on startup', async () => {
    const release = makeUpdate()
    native.check.mockResolvedValue(release)
    const updater = await load()
    await updater.checkForUpdates(false)
    expect(updater.currentVersion.value).toBe('0.146.0')
    expect(updater.availableVersion.value).toBe('0.147.0')
    expect(updater.dialogVisible.value).toBe(true)
    expect(release.downloadAndInstall).not.toHaveBeenCalled()
  })

  it('honors disabled automatic checks but still allows manual checks', async () => {
    storage.set('app-update-auto-check', 'false')
    const updater = await load()
    await updater.checkForUpdates(false)
    expect(native.check).not.toHaveBeenCalled()
    await updater.checkForUpdates()
    expect(native.check).toHaveBeenCalledOnce()
    expect(updater.status.value).toBe('current')
    updater.setAutoCheck(true)
    expect(storage.get('app-update-auto-check')).toBe('true')
  })

  it('suppresses a postponed version at startup but shows it on manual check', async () => {
    const release = makeUpdate()
    native.check.mockResolvedValue(release)
    const updater = await load()
    await updater.checkForUpdates(false)
    updater.dismissUpdate()
    expect(storage.get('app-update-dismissed-version')).toBe('0.147.0')
    await updater.checkForUpdates(false)
    expect(updater.dialogVisible.value).toBe(false)
    expect(release.close).toHaveBeenCalledOnce()
    await updater.checkForUpdates()
    expect(updater.dialogVisible.value).toBe(true)
  })

  it('prevents overlapping checks', async () => {
    let resolve!: (value: null) => void
    native.check.mockReturnValue(new Promise<null>(done => { resolve = done }))
    const updater = await load()
    const pending = updater.checkForUpdates()
    await vi.waitFor(() => expect(native.check).toHaveBeenCalledOnce())
    await updater.checkForUpdates()
    expect(native.check).toHaveBeenCalledOnce()
    resolve(null)
    await pending
  })

  it('keeps startup network errors quiet and allows retry', async () => {
    native.check.mockRejectedValueOnce(new Error('offline'))
    const updater = await load()
    await updater.checkForUpdates(false)
    expect(updater.dialogVisible.value).toBe(false)
    expect(updater.status.value).toBe('error')
    expect(updater.errorMessage.value).toContain('網路')
    await updater.checkForUpdates()
    expect(updater.status.value).toBe('current')
    expect(updater.errorMessage.value).toBe('')
  })

  it('tracks progress, blocks duplicate installs, and restarts only after success', async () => {
    const release = makeUpdate()
    let finish!: () => void
    let onEvent!: (event: DownloadEvent) => void
    release.downloadAndInstall.mockImplementation((callback: typeof onEvent) => {
      onEvent = callback
      return new Promise<void>(resolve => { finish = resolve })
    })
    native.check.mockResolvedValue(release)
    const updater = await load()
    await updater.checkForUpdates()
    const pending = updater.installUpdate()
    onEvent({ event: 'Started', data: { contentLength: 100 } })
    onEvent({ event: 'Progress', data: { chunkLength: 40 } })
    expect(updater.progress.value).toBe(40)
    updater.dismissUpdate()
    expect(updater.dialogVisible.value).toBe(true)
    await updater.installUpdate()
    await updater.checkForUpdates()
    expect(release.downloadAndInstall).toHaveBeenCalledOnce()
    expect(native.check).toHaveBeenCalledOnce()
    onEvent({ event: 'Finished' })
    expect(updater.status.value).toBe('installing')
    expect(native.relaunch).not.toHaveBeenCalled()
    finish()
    await pending
    expect(native.relaunch).toHaveBeenCalledOnce()
  })

  it('supports downloads without a content length', async () => {
    const release = makeUpdate()
    release.downloadAndInstall.mockImplementation(async (callback: (event: DownloadEvent) => void) => {
      callback({ event: 'Started', data: {} })
      callback({ event: 'Progress', data: { chunkLength: 800 } })
      expect(updater.progress.value).toBeUndefined()
    })
    native.check.mockResolvedValue(release)
    const updater = await load()
    await updater.checkForUpdates()
    await updater.installUpdate()
  })

  it('does not restart after signature or installation failure and allows retry', async () => {
    const release = makeUpdate()
    release.downloadAndInstall.mockRejectedValueOnce(new Error('invalid signature'))
    native.check.mockResolvedValue(release)
    const updater = await load()
    await updater.checkForUpdates()
    await updater.installUpdate()
    expect(updater.status.value).toBe('error')
    expect(updater.busy.value).toBe(false)
    expect(native.relaunch).not.toHaveBeenCalled()
    await updater.installUpdate()
    expect(native.relaunch).toHaveBeenCalledOnce()
  })

  it('retries only restarting when the installation already succeeded', async () => {
    const release = makeUpdate()
    native.check.mockResolvedValue(release)
    native.relaunch.mockRejectedValueOnce(new Error('restart blocked'))
    const updater = await load()
    await updater.checkForUpdates()
    await updater.installUpdate()
    expect(updater.status.value).toBe('restart-required')
    await updater.checkForUpdates()
    expect(native.check).toHaveBeenCalledOnce()
    await updater.installUpdate()
    expect(release.downloadAndInstall).toHaveBeenCalledOnce()
    expect(native.relaunch).toHaveBeenCalledTimes(2)
  })

  it.each(['browser', 'development'])('does not contact the updater in %s', async runtime => {
    if (runtime === 'browser') native.isTauri.mockReturnValue(false)
    else vi.stubEnv('DEV', true)
    const updater = await load()
    await updater.checkForUpdates()
    await updater.installUpdate()
    expect(updater.status.value).toBe('unsupported')
    expect(native.check).not.toHaveBeenCalled()
  })

  it('continues checking when preference storage is unavailable', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') } })
    native.check.mockResolvedValue(makeUpdate() as unknown as Update)
    const updater = await load()
    await updater.checkForUpdates(false)
    expect(updater.dialogVisible.value).toBe(true)
    updater.dismissUpdate()
    expect(updater.dialogVisible.value).toBe(false)
  })
})
