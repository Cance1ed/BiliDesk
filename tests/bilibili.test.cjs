const test = require('node:test');
const assert = require('node:assert/strict');
const { BilibiliClient } = require('../electron/bilibili.cjs');
const json = (data) =>
  new Response(JSON.stringify({ code: 0, data }), { headers: { 'Content-Type': 'application/json' } });
test('creating a folder uses only the add endpoint and explicit privacy, never an existing ID', async () => {
  let calls = 0;
  const client = new BilibiliClient(async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.bilibili.com/x/v3/fav/folder/add');
    assert.equal(options.method, 'POST');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(options.body)), {
      title: '壁纸',
      privacy: calls === 1 ? '1' : '0',
      csrf: 'fixture',
    });
    return json({ id: 456, mid: 123, title: '壁纸' });
  });
  assert.deepEqual(await client.createFolder(' 壁纸 ', true, 'fixture'), {
    id: 456,
    ownerMid: 123,
    title: '壁纸',
  });
  await client.createFolder('壁纸', false, 'fixture');
  await assert.rejects(client.createFolder('壁纸', true, ''), /登录/);
  assert.equal(calls, 2);
});
test('account API requests include isolated session credentials', async () => {
  const client = new BilibiliClient(async (_url, options) => {
    assert.equal(options.credentials, 'include');
    return json({ isLogin: true, mid: 123, uname: 'Fixture user', face: '' });
  });
  assert.equal((await client.profile()).mid, 123);
});
test('short-link redirect is validated before following any new host', async () => {
  const seen = [];
  const client = new BilibiliClient(async (url) => {
    seen.push(url);
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  });
  await assert.rejects(client.resolve('https://b23.tv/example'), /仅支持/);
  assert.equal(seen.length, 1);
});
test('metadata picks the requested part, not the first part', async () => {
  const client = new BilibiliClient(async () =>
    json({
      bvid: 'BV1xx411c7mD',
      title: 'Example',
      pic: 'http://i0.hdslb.com/image.jpg',
      owner: { name: 'Author' },
      pages: [
        { page: 1, cid: 123, duration: 60, part: 'One' },
        { page: 2, cid: 456, duration: 30, part: 'Two' },
      ],
    }),
  );
  const video = await client.resolve('https://www.bilibili.com/video/BV1xx411c7mD/?p=2');
  assert.equal(video.cid, 456);
  assert.equal(video.id, 'BV1xx411c7mD:456');
  assert.equal(video.duration, 30);
  assert.equal(video.cover, 'https://i0.hdslb.com/image.jpg');
  await assert.rejects(client.resolve('https://www.bilibili.com/video/BV1xx411c7mD/?p=3'), /没有第 3 P/);
});
test('anonymous nav may provide WBI keys, while permission errors surface clearly', async () => {
  const client = new BilibiliClient(
    async () =>
      new Response(
        JSON.stringify({
          code: -101,
          data: {
            isLogin: false,
            wbi_img: { img_url: 'https://i0.hdslb.com/a.png', sub_url: 'https://i0.hdslb.com/b.png' },
          },
        }),
      ),
  );
  assert.equal(await client.profile(), null);
  assert.ok(client.wbi);
  await assert.rejects(client.folders(123), /登录已过期/);
});
test('stream chooses highest available H264 within requested quality and keeps audio', async () => {
  const client = new BilibiliClient(async () =>
    json({
      dash: {
        duration: 60,
        video: [
          { id: 120, codecid: 7, baseUrl: 'https://a.bilivideo.com/4k' },
          { id: 80, codecid: 12, baseUrl: 'https://a.bilivideo.com/hevc' },
          { id: 64, codecid: 7, baseUrl: 'https://a.bilivideo.com/720' },
        ],
        audio: [{ bandwidth: 100, baseUrl: 'https://a.bilivideo.com/audio' }],
      },
    }),
  );
  client.wbi = {
    img_url: `https://a/${'a'.repeat(32)}.png`,
    sub_url: `https://a/${'b'.repeat(32)}.png`,
    time: Date.now(),
  };
  const stream = await client.stream({ bvid: 'BV1xx411c7mD', cid: 1 }, 80);
  assert.equal(stream.quality, 64);
  assert.equal(stream.audioUrl, 'https://a.bilivideo.com/audio');
});
test('stream falls back to backup mirrors when the primary media URL is rejected', async () => {
  const client = new BilibiliClient(async () =>
    json({
      dash: {
        video: [
          {
            id: 16,
            codecid: 7,
            baseUrl: 'https://x.mcdn.bilivideo.cn:8082/video',
            backupUrl: ['https://upos.bilivideo.com/video'],
          },
        ],
        audio: [
          {
            bandwidth: 100,
            base_url: 'https://x.mcdn.bilivideo.cn:8082/audio',
            backup_url: ['https://evil.example/audio', 'http://upos.bilivideo.com/audio'],
          },
        ],
      },
    }),
  );
  client.wbi = {
    img_url: `https://a/${'a'.repeat(32)}.png`,
    sub_url: `https://a/${'b'.repeat(32)}.png`,
    time: Date.now(),
  };
  const stream = await client.stream({ bvid: 'BV1xx411c7mD', cid: 1 }, 80);
  assert.equal(stream.videoUrl, 'https://upos.bilivideo.com/video');
  assert.equal(stream.audioUrl, 'https://upos.bilivideo.com/audio');
});
test('favorites pagination and invalid items are handled', async () => {
  let requested;
  const client = new BilibiliClient(async (url) => {
    requested = new URL(url);
    return json({
      has_more: true,
      medias: [
        { type: 2, bvid: 'BV1xx411c7mD', title: 'Video' },
        { type: 2, title: '已失效视频' },
        { type: 12, bvid: 'audio', title: 'Audio' },
      ],
    });
  });
  const page = await client.favorites(1234, 3);
  assert.equal(requested.searchParams.get('pn'), '3');
  assert.equal(requested.searchParams.get('ps'), '20');
  assert.equal(page.hasMore, true);
  assert.equal(page.videos.length, 1);
});
test('a user without accessible folders may return null data', async () => {
  const client = new BilibiliClient(async () => json(null));
  assert.deepEqual(await client.folders(2), []);
  await assert.rejects(client.favorites(123, 1), /无法访问/);
});
test('subscribed collections use platform=web and keep pagination before filtering mixed folder types', async () => {
  const client = new BilibiliClient(async (url) => {
    assert.equal(new URL(url).searchParams.get('platform'), 'web');
    return json({
      count: 21,
      has_more: true,
      list: [
        { id: 1, type: 11, state: 0 },
        { id: 2, type: 21, state: 0, mid: 123, title: '合集', media_count: 31 },
        { id: 3, type: 21, state: 1 },
      ],
    });
  });
  const result = await client.collections(123, 1);
  assert.equal(result.hasMore, true);
  assert.deepEqual(
    result.collections.map((c) => c.id),
    [2],
  );
});
test('collection video pagination preserves order and verifies collection owner', async () => {
  const client = new BilibiliClient(async (url) => {
    assert.equal(new URL(url).searchParams.get('page_num'), '2');
    return json({
      meta: { season_id: 2, mid: 123, title: '合集' },
      page: { total: 61 },
      archives: [
        { bvid: 'BV17x411w7KC', state: 0, title: 'A' },
        { bvid: 'BV1xx411c7mD', state: 0, title: 'B' },
        { bvid: 'BV1GJ411x7h7', state: -1 },
      ],
    });
  });
  const result = await client.collectionVideos(2, 123, 2);
  assert.equal(result.hasMore, true);
  assert.deepEqual(
    result.videos.map((v) => v.title),
    ['A', 'B'],
  );
  await assert.rejects(client.collectionVideos(2, 999, 2), /归属/);
});
test('saving favorites posts CSRF in body and never sends deletion fields', async () => {
  let calls = 0;
  const client = new BilibiliClient(async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.bilibili.com/x/v3/fav/resource/deal');
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'include');
    const params = new URLSearchParams(options.body);
    assert.equal(params.get('csrf'), 'fixture-token');
    assert.equal(params.get('rid'), '170001');
    assert.equal(params.get('type'), '2');
    assert.equal(params.get('add_media_ids'), '456');
    assert.equal(params.has('del_media_ids'), false);
    return json({});
  });
  await client.addFavorite(170001, 456, 'fixture-token');
  await assert.rejects(client.addFavorite(170001, 456, ''), /登录/);
  assert.equal(calls, 1);
});
