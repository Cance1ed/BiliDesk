const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SubscriptionManager,
  normalizeSubscriptions,
  parseSubscriptionTarget,
} = require('../electron/subscriptions.cjs');
const ids = ['BV17x411w7KC', 'BV1xx411c7mD', 'BV1GJ411x7h7'];
const video = (bvid, cid = ids.indexOf(bvid) + 1) => ({
  bvid,
  id: `${bvid}:${cid}`,
  cid,
  page: 1,
  title: bvid,
  duration: 10,
});
const info = { id: 456, ownerMid: 123, ownerName: '测试 UP 主', title: '风景', count: 2 };
const page = (bvids, hasMore = false) => ({ info, hasMore, videos: bvids.map((bvid) => ({ bvid })) });
function fixture(overrides = {}) {
  const library = {
    playlist: [],
    subscriptions: normalizeSubscriptions([{ ownerMid: 123, folderId: 456, title: '风景' }]),
  };
  let time = 1000000000,
    saves = 0;
  const client = {
    favorites: async () => page([ids[0]]),
    folders: async (mid) => [{ id: 456, title: `UID ${mid}`, count: 2 }],
    resolve: async (bvid) => video(bvid),
    ...overrides,
  };
  const manager = new SubscriptionManager({
    client,
    getLibrary: () => library,
    save: async () => {
      saves++;
    },
    changed: () => {},
    now: () => time,
  });
  return {
    library,
    client,
    manager,
    saves: () => saves,
    advance: (ms) => {
      time += ms;
    },
  };
}
test('subscription targets accept UID and exact space URLs, rejecting arbitrary hosts and ambiguous IDs', () => {
  assert.deepEqual(parseSubscriptionTarget('123'), { ownerMid: 123 });
  assert.deepEqual(parseSubscriptionTarget('https://space.bilibili.com/123/favlist?fid=456&ftype=create'), {
    ownerMid: 123,
    folderId: 456,
  });
  assert.deepEqual(parseSubscriptionTarget('space.bilibili.com/123'), { ownerMid: 123 });
  for (const value of [
    '0',
    '-1',
    '12.3',
    'https://space.bilibili.com.evil.test/123',
    'https://user:pass@space.bilibili.com/123',
    'https://space.bilibili.com:9090/123',
    'https://space.bilibili.com/123/favlist?fid=0',
    'https://space.bilibili.com/123/dynamic',
    'https://127.0.0.1/123',
  ])
    assert.throws(() => parseSubscriptionTarget(value));
});
test('discover works anonymously and validates a directly linked folder owner', async () => {
  const { manager, client } = fixture();
  assert.equal((await manager.discover('123')).folders[0].id, 456);
  assert.equal(
    (await manager.discover('https://space.bilibili.com/123/favlist?fid=456')).selectedFolderId,
    456,
  );
  client.favorites = async () => ({ ...page([]), info: { ...info, ownerMid: 999 } });
  await assert.rejects(manager.discover('https://space.bilibili.com/123/favlist?fid=456'), /不属于/);
});
test('sync reads all pages, appends only unseen videos and respects manual removals', async () => {
  const calls = [];
  const { manager, library, client } = fixture({
    favorites: async (_id, pn) => {
      calls.push(pn);
      return pn === 1 ? page([ids[0]], true) : page([ids[1]]);
    },
  });
  library.playlist.push(video(ids[0]));
  await manager.sync('456');
  assert.deepEqual(calls, [1, 2]);
  assert.equal(library.playlist.length, 2);
  assert.equal(library.subscriptions[0].addedLast, 1);
  library.playlist = library.playlist.filter((v) => v.bvid !== ids[0]);
  client.favorites = async () => page(ids);
  await manager.sync('456');
  assert.deepEqual(
    library.playlist.map((v) => v.bvid),
    [ids[1], ids[2]],
  );
  assert.equal(manager.snapshot()[0].videoCount, 3);
  assert.equal('knownBvids' in manager.snapshot()[0], false);
  await manager.remove('456');
  assert.equal(library.playlist.length, 2);
  assert.equal(library.subscriptions.length, 0);
});
test('later page failure preserves the playlist and known IDs for retry', async () => {
  const { manager, library } = fixture({
    favorites: async (_id, pn) => {
      if (pn === 2) throw new Error('network unavailable');
      return page([ids[0]], true);
    },
  });
  await manager.sync('456');
  assert.equal(library.playlist.length, 0);
  assert.deepEqual(library.subscriptions[0].knownBvids, []);
  assert.match(library.subscriptions[0].lastError, /network unavailable/);
  assert.equal(manager.running.size, 0);
});
test('a temporarily unavailable video is retried, while successful entries are deduplicated', async () => {
  let failure = true;
  const { manager, library } = fixture({
    favorites: async () => page([ids[0], ids[1]]),
    resolve: async (bvid) => {
      if (bvid === ids[1] && failure) throw new Error('not available');
      return video(bvid);
    },
  });
  await manager.sync('456');
  assert.equal(library.playlist.length, 1);
  assert.match(library.subscriptions[0].lastError, /not available/);
  failure = false;
  await manager.sync('456');
  assert.equal(library.playlist.length, 2);
  assert.equal(library.subscriptions[0].lastError, '');
});
test('scheduler observes intervals and paused subscriptions', async () => {
  let reads = 0;
  const { manager, library, advance } = fixture({
    favorites: async () => {
      reads++;
      return page([]);
    },
  });
  await manager.tick();
  assert.equal(reads, 1);
  await manager.tick();
  assert.equal(reads, 1);
  advance(3600000);
  await manager.tick();
  assert.equal(reads, 2);
  await manager.update('456', { enabled: false, intervalMinutes: 15 });
  advance(3600000);
  await manager.tick();
  assert.equal(reads, 2);
  assert.equal(library.subscriptions[0].enabled, false);
});
test('unsubscribe cancels an in-flight sync without restoring removed subscription or appending its video', async () => {
  let release, started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const { manager, library } = fixture({
    resolve: async (bvid) => {
      started();
      await wait;
      return video(bvid);
    },
  });
  const syncing = manager.sync('456');
  await ready;
  await manager.remove('456');
  release();
  await syncing;
  assert.equal(library.playlist.length, 0);
  assert.equal(library.subscriptions.length, 0);
});
test('duplicate subscriptions, ownership mismatch, invalid schedules and full playlists are rejected safely', async () => {
  const { manager, library, client } = fixture();
  await assert.rejects(manager.add({ ownerMid: 123, folderId: 456 }), /已订阅/);
  await assert.rejects(manager.update('456', { enabled: true, intervalMinutes: 1 }), /无效/);
  library.subscriptions = [];
  client.favorites = async () => ({ ...page([ids[0]]), info: { ...info, ownerMid: 789 } });
  await assert.rejects(manager.add({ ownerMid: 123, folderId: 456 }), /不属于/);
  assert.equal(library.subscriptions.length, 0);
  library.subscriptions = normalizeSubscriptions([{ ownerMid: 123, folderId: 456 }]);
  client.favorites = async () => page([ids[0]]);
  library.playlist = Array.from({ length: 1000 }, (_, i) => video(ids[2], i + 1));
  await manager.sync('456');
  assert.equal(library.playlist.length, 1000);
  assert.match(library.subscriptions[0].lastError, /1000/);
  assert.deepEqual(library.subscriptions[0].knownBvids, []);
});
