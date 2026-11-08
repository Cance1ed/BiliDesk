const test = require('node:test');
const assert = require('node:assert/strict');
const { CloudSync, normalizeCloudSync } = require('../electron/cloud-sync.cjs');
const bvs = ['BV17x411w7KC', 'BV1xx411c7mD', 'BV1GJ411x7h7'];
const video = (bvid, aid = bvs.indexOf(bvid) + 1) => ({ bvid, aid });
function fixture() {
  const library = {
    playlist: bvs.map((bv) => video(bv)),
    cloudSync: normalizeCloudSync({ ownerMid: 123, folderId: 456, enabled: false }),
  };
  let account = 123,
    saved = 0;
  const writes = [],
    existing = new Set([bvs[0]]);
  const client = {
    profile: async () => ({ mid: account }),
    favorites: async () => ({
      info: { id: 456, ownerMid: 123, title: '壁纸' },
      hasMore: false,
      videos: [...existing].map((bvid) => ({ bvid })),
    }),
    resolve: async (bvid) => video(bvid),
  };
  const service = new CloudSync({
    client,
    getLibrary: () => library,
    getAccount: () => account,
    save: async () => {
      saved++;
    },
    changed: () => {},
    delay: async () => {},
    writeFavorite: async (aid, folder, mid, valid) => {
      assert.ok(valid());
      assert.equal(folder, 456);
      assert.equal(mid, 123);
      writes.push(aid);
      existing.add(bvs[aid - 1]);
    },
  });
  return {
    service,
    client,
    library,
    writes,
    existing,
    account: (value) => {
      account = value;
    },
    saves: () => saved,
  };
}
test('cloud sync is opt-in and validates owned destination before enabling', async () => {
  assert.equal(normalizeCloudSync().enabled, false);
  assert.equal(normalizeCloudSync({ enabled: true }).enabled, false);
  const { service, client, library } = fixture();
  client.favorites = async () => ({ info: { id: 456, ownerMid: 999 } });
  await assert.rejects(service.configure({ folderId: 456, enabled: true }), /自己/);
  assert.equal(library.cloudSync.enabled, false);
  service.close();
});
test('cloud sync deduplicates parts and preserves remote videos, repeat sync writes nothing', async () => {
  const { service, library, writes, existing } = fixture();
  library.playlist.push(video(bvs[1]));
  existing.add('BV1ab411c7mD');
  await service.sync();
  assert.deepEqual(writes, [2, 3]);
  assert.equal(existing.size, 4);
  assert.ok(library.cloudSync.lastSyncAt);
  await service.sync();
  assert.deepEqual(writes, [2, 3]);
  service.close();
});
test('cloud sync fetches all remote pages before any account write', async () => {
  const { service, client, writes, library } = fixture();
  client.favorites = async (_id, page) => {
    if (page === 2) throw new Error('page failed');
    return { info: { id: 456, ownerMid: 123 }, hasMore: true, videos: [] };
  };
  await service.sync();
  assert.equal(writes.length, 0);
  assert.match(library.cloudSync.lastError, /page failed/);
  service.close();
});
test('partial write failures persist and retry only videos still missing', async () => {
  const { service, writes, library } = fixture();
  const write = service.writeFavorite;
  service.writeFavorite = async (...args) => {
    if (args[0] === 3) throw new Error('HTTP 429');
    return write(...args);
  };
  await service.sync();
  assert.deepEqual(writes, [2]);
  assert.match(library.cloudSync.lastError, /429/);
  service.writeFavorite = write;
  await service.sync();
  assert.deepEqual(writes, [2, 3]);
  assert.equal(library.cloudSync.lastError, '');
  service.close();
});
test('logout or cancellation during metadata resolution prevents account writes', async () => {
  const { service, client, library, writes, account } = fixture();
  library.playlist = [{ bvid: bvs[1] }];
  let release, started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  client.resolve = async (bvid) => {
    started();
    await new Promise((resolve) => {
      release = resolve;
    });
    return video(bvid);
  };
  const syncing = service.sync();
  await ready;
  account(999);
  service.cancel();
  release();
  await syncing;
  assert.equal(writes.length, 0);
  service.close();
});
test('a stale account or foreign target never receives a write', async () => {
  const { service, client, writes, library, account } = fixture();
  account(999);
  await assert.rejects(service.sync(), /当前账号/);
  account(123);
  client.profile = async () => ({ mid: 999 });
  await service.sync();
  assert.equal(writes.length, 0);
  assert.match(library.cloudSync.lastError, /登录状态/);
  service.close();
});
test('automatic scheduler coalesces changes and does not immediately retry failures', async () => {
  const { service, library, client } = fixture();
  library.cloudSync.enabled = true;
  service.schedule();
  const timer = service.timer;
  assert.ok(timer);
  service.schedule();
  assert.equal(service.timer, timer);
  service.cancel();
  client.profile = async () => {
    throw new Error('offline');
  };
  await service.sync();
  assert.equal(service.timer, null);
  library.playlist.push(video('BV1ab411c7mD', 4));
  service.schedule();
  assert.ok(service.timer);
  await service.disable();
  assert.equal(service.timer, null);
  assert.equal(library.cloudSync.enabled, false);
  service.close();
});
test('old videos without aid resolve metadata before saving to favorites', async () => {
  const { service, library, writes } = fixture();
  library.playlist = [{ bvid: bvs[1] }];
  await service.sync();
  assert.deepEqual(writes, [2]);
  service.close();
});
