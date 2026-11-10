const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../electron/store.cjs');
test('queued atomic saves keep the newest settings and recover from corrupt data', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bilidesk-test-'));
  try {
    const store = new Store(directory);
    const initial = await store.load();
    assert.deepEqual(initial.playlist, []);
    assert.deepEqual(initial.subscriptions, []);
    assert.equal(initial.cloudSync.enabled, false);
    assert.equal(initial.settings.autoPlayOnLaunch, true);
    assert.equal(initial.settings.pauseWhenDesktopHidden, true);
    assert.equal(initial.settings.showProgressBar, false);
    await Promise.all([
      store.save({ ...initial, settings: { ...initial.settings, volume: 20 } }),
      store.save({
        ...initial,
        settings: {
          ...initial.settings,
          volume: 70,
          portraitColumns: 4,
          autoPlayOnLaunch: false,
          pauseWhenDesktopHidden: false,
          showProgressBar: true,
        },
      }),
    ]);
    assert.equal((await store.load()).settings.volume, 70);
    assert.equal((await store.load()).settings.portraitColumns, 4);
    assert.equal((await store.load()).settings.autoPlayOnLaunch, false);
    assert.equal((await store.load()).settings.pauseWhenDesktopHidden, false);
    assert.equal((await store.load()).settings.showProgressBar, true);
    initial.cloudSync = { ownerMid: 123, folderId: 456, title: '云端壁纸', enabled: true, lastSyncAt: 12345 };
    initial.subscriptions = [
      {
        ownerMid: 123,
        folderId: 456,
        title: 'Persistent',
        intervalMinutes: 15,
        knownBvids: ['BV17x411w7KC'],
      },
    ];
    await store.save(initial);
    const restored = await store.load();
    assert.equal(restored.cloudSync.enabled, true);
    assert.equal(restored.cloudSync.ownerMid, 123);
    assert.equal(restored.cloudSync.folderId, 456);
    assert.equal(restored.subscriptions[0].title, 'Persistent');
    assert.deepEqual(restored.subscriptions[0].knownBvids, ['BV17x411w7KC']);
    await fs.writeFile(path.join(directory, 'library.json'), 'invalid-json');
    assert.equal((await store.load()).settings.volume, 0);
    await assert.rejects(
      store.saveAuth([{ value: 'secret' }], { isAsyncEncryptionAvailable: async () => false }),
      /不会保存/,
    );
    await assert.rejects(fs.access(path.join(directory, 'account.enc')));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
