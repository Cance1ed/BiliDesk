const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { removeVideos, moveVideo } = require('../electron/playlist-edit.cjs');
const { normalizeLibrary, createPlaylist } = require('../electron/library.cjs');
const { Store } = require('../electron/store.cjs');
const videos = Array.from({ length: 5 }, (_, i) => ({
  id: `BV17x411w7KC:${i + 1}`,
  bvid: 'BV17x411w7KC',
  cid: i + 1,
  title: `Video ${i + 1}`,
}));
const order = (items) => items.map((v) => v.cid);

test('drag insertion works in both directions and at boundaries without dropping hidden or newly added items', () => {
  assert.deepEqual(order(moveVideo(videos, videos[0].id, videos[4].id, 'after')), [2, 3, 4, 5, 1]);
  assert.deepEqual(order(moveVideo(videos, videos[4].id, videos[0].id, 'before')), [5, 1, 2, 3, 4]);
  assert.deepEqual(order(moveVideo(videos, videos[0].id, videos[3].id, 'before')), [2, 3, 1, 4, 5]);
  assert.deepEqual(order(moveVideo(videos, videos[4].id, videos[1].id, 'after')), [1, 2, 5, 3, 4]);
  assert.deepEqual(moveVideo(videos, videos[0].id, videos[0].id, 'before'), videos);
  assert.deepEqual(order(videos), [1, 2, 3, 4, 5]);
  assert.throws(() => moveVideo(videos, 'gone', videos[0].id, 'before'), /已移除/);
  assert.throws(() => moveVideo(videos, videos[0].id, 'gone', 'after'), /已移除/);
  assert.throws(() => moveVideo(videos, videos[0].id, videos[1].id, 'invalid'), /排序/);
});

test('batch deletion keeps unselected entries and supports duplicate/stale IDs and deleting all', () => {
  assert.deepEqual(
    order(removeVideos(videos, [videos[1].id, videos[3].id, videos[1].id, 'gone'])),
    [1, 3, 5],
  );
  assert.deepEqual(
    removeVideos(
      videos,
      videos.map((v) => v.id),
    ),
    [],
  );
  for (const input of [null, [], 'all', [null], Array(1001).fill('id')])
    assert.throws(() => removeVideos(videos, input), /请选择/);
});

test('edits survive reload and leave another playlist, subscriptions and account sync target intact', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bilidesk-edit-'));
  try {
    const store = new Store(directory);
    const library = normalizeLibrary({
      playlist: videos,
      cloudSync: { ownerMid: 123, folderId: 456, enabled: true },
    });
    const copy = createPlaylist(library, '副本', true);
    const cloudBefore = structuredClone(library.cloudSync);
    library.playlist = moveVideo(library.playlist, videos[4].id, videos[0].id, 'before');
    library.playlist = removeVideos(library.playlist, [videos[1].id, videos[3].id]);
    await store.save(library);
    const loaded = await new Store(directory).load();
    assert.deepEqual(order(loaded.playlist), [5, 1, 3]);
    assert.deepEqual(loaded.cloudSync, cloudBefore);
    assert.deepEqual(loaded.subscriptions, []);
    loaded.activePlaylistId = copy.id;
    assert.deepEqual(order(loaded.playlist), [1, 2, 3, 4, 5]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
