const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../electron/store.cjs');
const {
  normalizeLibrary,
  activePlaylist,
  createPlaylist,
  renamePlaylist,
} = require('../electron/library.cjs');
const legacy = () => ({
  playlist: Array.from({ length: 244 }, (_, i) => ({
    id: `BV17x411w7KC:${i + 1}`,
    bvid: 'BV17x411w7KC',
    cid: i + 1,
    title: `Part ${i + 1}`,
  })),
  subscriptions: [
    { ownerMid: 123, folderId: 456, title: '订阅', intervalMinutes: 60, knownBvids: ['BV17x411w7KC'] },
  ],
  cloudSync: { ownerMid: 123, folderId: 789, title: '云端', enabled: true, lastSyncAt: 1000 },
  settings: { volume: 23 },
});
test('migration keeps all 244 ordered entries, subscriptions and cloud target with an immutable backup', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bilidesk-migration-'));
  try {
    const original = JSON.stringify(legacy());
    await fs.writeFile(path.join(directory, 'library.json'), original);
    const store = new Store(directory),
      library = await store.load();
    assert.deepEqual(library.playlist, legacy().playlist);
    assert.equal(activePlaylist(library).name, '默认播放列表');
    assert.equal(library.cloudSync.folderId, 789);
    assert.equal(library.cloudSync.enabled, true);
    assert.deepEqual(library.subscriptions[0].knownBvids, ['BV17x411w7KC']);
    await store.save(library);
    assert.equal(
      await fs.readFile(path.join(directory, 'library.before-multi-playlists.json'), 'utf8'),
      original,
    );
    const copy = createPlaylist(library, '工作', true);
    library.activePlaylistId = copy.id;
    library.playlist.reverse();
    library.cloudSync = { ownerMid: 123, folderId: 990, enabled: true };
    await store.save(library);
    const loaded = await new Store(directory).load();
    assert.equal(loaded.activePlaylistId, copy.id);
    assert.equal(loaded.playlist[0].cid, 244);
    assert.equal(loaded.cloudSync.folderId, 990);
    loaded.activePlaylistId = 'default';
    assert.deepEqual(loaded.playlist, legacy().playlist);
    assert.equal(loaded.cloudSync.folderId, 789);
    assert.equal(loaded.subscriptions.length, 1);
    const disk = JSON.parse(await fs.readFile(path.join(directory, 'library.json'), 'utf8'));
    assert.equal(disk.version, 2);
    assert.equal(disk.playlist, undefined);
    assert.equal(
      await fs.readFile(path.join(directory, 'library.before-multi-playlists.json'), 'utf8'),
      original,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test('new and copied lists have independent videos, subscriptions and opt-in sync targets', () => {
  const library = normalizeLibrary(legacy()),
    original = activePlaylist(library);
  const empty = createPlaylist(library, '风景'),
    copy = createPlaylist(library, '副本', true);
  assert.equal(empty.playlist.length, 0);
  assert.deepEqual(copy.playlist, original.playlist);
  assert.equal(copy.cloudSync.folderId, 0);
  assert.equal(copy.cloudSync.enabled, false);
  assert.deepEqual(copy.subscriptions, []);
  library.activePlaylistId = copy.id;
  library.playlist.splice(0, 1);
  library.playlist[0].title = 'changed';
  assert.equal(original.playlist.length, 244);
  assert.equal(original.playlist[1].title, 'Part 2');
  renamePlaylist(library, copy.id, '专注');
  assert.equal(copy.name, '专注');
  assert.throws(() => renamePlaylist(library, copy.id, '风景'), /已存在/);
  assert.throws(() => createPlaylist(library, '   '), /名称/);
  assert.throws(() => createPlaylist(library, 'x'.repeat(61)), /名称/);
  assert.throws(() => createPlaylist(library, '风景'), /已存在/);
  for (let i = library.playlists.length; i < 20; i++) createPlaylist(library, `list${i}`);
  assert.throws(() => createPlaylist(library, 'overflow'), /20/);
});
test('invalid global settings or stale active IDs never discard valid video lists', () => {
  const library = normalizeLibrary({ ...legacy(), settings: { volume: -100 } });
  assert.equal(library.playlist.length, 244);
  const disk = JSON.parse(JSON.stringify(library));
  disk.activePlaylistId = 'missing';
  assert.equal(normalizeLibrary(disk).activePlaylistId, 'default');
  assert.equal(normalizeLibrary(null).playlists.length, 1);
});
