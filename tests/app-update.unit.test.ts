import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { AppUpdateService, type UpdateDriver } from '../electron/app-update';
import { UPDATE_INTERVAL_MS } from '../shared/app-update';

function fixture(enabled = true) {
  const driver = Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowDowngrade: true,
    allowPrerelease: true,
    checkForUpdates: vi.fn(async () => ({
      isUpdateAvailable: true,
      updateInfo: { version: '0.4.1' },
    })),
    downloadUpdate: vi.fn(async () => ['installer.exe']),
    quitAndInstall: vi.fn(),
  });
  const notify = vi.fn(),
    blocker = vi.fn<() => string | undefined>(() => undefined);
  const service = new AppUpdateService(driver as unknown as UpdateDriver, enabled, notify, blocker);
  return { driver, service, notify, blocker };
}
afterEach(() => vi.useRealTimers());

it('checks periodically without downloading, keeps offline checks quiet, and disables unsupported hosts', async () => {
  vi.useFakeTimers();
  const { driver, service } = fixture();
  expect(driver.autoDownload).toBe(false);
  expect(driver.autoInstallOnAppQuit).toBe(false);
  expect(driver.allowDowngrade).toBe(false);
  expect(driver.allowPrerelease).toBe(false);
  driver.checkForUpdates.mockRejectedValueOnce(new Error('Offline'));
  service.start();
  service.start();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(service.state()).toEqual({ phase: 'idle' });
  await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
  expect(service.state()).toEqual({ phase: 'available', version: '0.4.1' });
  expect(driver.checkForUpdates).toHaveBeenCalledTimes(2);
  expect(driver.downloadUpdate).not.toHaveBeenCalled();
  service.close();
  await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
  expect(driver.checkForUpdates).toHaveBeenCalledTimes(2);
  const disabled = fixture(false);
  disabled.service.start();
  await disabled.service.check();
  await expect(disabled.service.download()).rejects.toThrow('installed desktop');
  expect(() => disabled.service.install(0)).toThrow('installed desktop');
  expect(disabled.driver.checkForUpdates).not.toHaveBeenCalled();
  disabled.service.close();
});

it('serializes checks and downloads, reports progress, and requires an explicit install', async () => {
  const { driver, service, blocker } = fixture();
  await Promise.all([service.check(), service.check()]);
  expect(driver.checkForUpdates).toHaveBeenCalledTimes(1);
  let complete!: (files: string[]) => void;
  driver.downloadUpdate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const download = service.download();
  await service.download();
  await service.check();
  driver.emit('download-progress', { percent: 42.7 });
  expect(service.state().percent).toBe(42);
  expect(driver.downloadUpdate).toHaveBeenCalledTimes(1);
  expect(() => service.install(0)).toThrow('Download');
  complete(['installer.exe']);
  await download;
  expect(driver.quitAndInstall).not.toHaveBeenCalled();
  expect(() => service.install(1)).toThrow('queued Codex');
  expect(() => service.install(-1)).toThrow('Invalid');
  blocker.mockReturnValueOnce('Generation is busy');
  expect(() => service.install(0)).toThrow('Generation is busy');
  service.install(0);
  expect(driver.quitAndInstall).toHaveBeenCalledWith(false, true);
  expect(() => service.install(0)).toThrow();
  expect(driver.quitAndInstall).toHaveBeenCalledTimes(1);
  service.close();
});

it('allows retry after a failed download or installer launch without automatically installing', async () => {
  const { driver, service } = fixture();
  await service.check();
  driver.downloadUpdate.mockRejectedValueOnce(new Error('Checksum mismatch'));
  await service.download();
  expect(service.state()).toMatchObject({
    phase: 'available',
    message: expect.stringContaining('retry'),
  });
  await service.download();
  expect(service.state()).toEqual({ phase: 'ready', version: '0.4.1' });
  driver.quitAndInstall.mockImplementationOnce(() => {
    driver.emit('error', new Error('Installer launch failed'));
  });
  service.install(0);
  expect(service.state()).toMatchObject({
    phase: 'ready',
    message: expect.stringContaining('retry'),
  });
  service.install(0);
  expect(driver.quitAndInstall).toHaveBeenCalledTimes(2);
  service.close();
});
