const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVideoInput, signWbi, nextIndex, validateSettings, isMediaUrl } = require('../electron/core.cjs');
test('video IDs, short links and multipart links preserve identity', () => {
  assert.deepEqual(parseVideoInput('BV1xx411c7mD'), { bvid: 'BV1xx411c7mD', page: 1 });
  assert.deepEqual(parseVideoInput('https://www.bilibili.com/video/BV1xx411c7mD/?p=3&share_source=copy'), {
    bvid: 'BV1xx411c7mD',
    page: 3,
  });
  assert.deepEqual(parseVideoInput('av170001'), { aid: '170001', page: 1 });
  assert.deepEqual(parseVideoInput('https://b23.tv/abc123'), { short: 'https://b23.tv/abc123' });
});
test('rejects lookalike hosts, credentials, arbitrary paths and invalid pages', () => {
  for (const url of [
    'https://bilibili.com.evil.test/video/BV1xx411c7mD',
    'https://bilibili.com@evil.test/video/BV1xx411c7mD',
    'https://www.bilibili.com:9000/video/BV1xx411c7mD',
    'file:///etc/passwd',
    'https://www.bilibili.com/video/BV1xx411c7mD?p=-1',
    'https://www.bilibili.com/video/BV1xx411c7mD?p=1.5',
    'https://www.bilibili.com/account',
  ])
    assert.throws(() => parseVideoInput(url));
});
test('WBI signature matches the published deterministic vector', () => {
  assert.equal(
    signWbi(
      { foo: '114', bar: '514', zab: 1919810 },
      '7cd084941338484aae1ad9425b84077c',
      '4932caff0ff746eab6f01bf08b70ac45',
      1702204169,
    ),
    'bar=514&foo=114&wts=1702204169&zab=1919810&w_rid=8f6f2b5b3d485fe1886cec6a0be8c5d4',
  );
});
test('playlist progression handles wrap, single and nonrepeating shuffle', () => {
  assert.equal(nextIndex(0, 0, 'sequence'), -1);
  assert.equal(nextIndex(3, 2, 'sequence'), 0);
  assert.equal(nextIndex(3, 1, 'single'), 1);
  assert.equal(nextIndex(1, 0, 'shuffle'), 0);
  for (let i = 0; i < 10; i++)
    for (const r of [0, 0.2, 0.9, 0.99999])
      assert.notEqual(
        nextIndex(10, i, 'shuffle', () => r),
        i,
      );
});
test('invalid settings cannot cross IPC or be restored from disk', () => {
  assert.equal(validateSettings({ volume: 42 }).volume, 42);
  for (const value of [
    { volume: 101 },
    { volume: NaN },
    { mode: 'anything' },
    { quality: 999 },
    { interval: -1 },
    { launchAtLogin: 'true' },
    { autoPlayOnLaunch: 'false' },
    { pauseWhenDesktopHidden: 'true' },
    { showProgressBar: 1 },
    { portraitColumns: 1 },
    { portraitColumns: 99 },
    { portraitColumns: '3' },
  ])
    assert.throws(() => validateSettings(value));
  assert.equal('unexpected' in validateSettings({ unexpected: 'ignored' }), false);
  assert.equal(validateSettings({}).portraitColumns, 0);
  assert.equal(validateSettings({ portraitColumns: 3 }).portraitColumns, 3);
});
test('startup playback defaults on for new and older settings while explicit opt-out is preserved', () => {
  assert.equal(validateSettings().autoPlayOnLaunch, true);
  assert.equal(validateSettings({ volume: 20, launchAtLogin: false }).autoPlayOnLaunch, true);
  assert.equal(validateSettings({ autoPlayOnLaunch: false }).autoPlayOnLaunch, false);
  assert.equal(validateSettings().launchAtLogin, false);
});
test('visibility pause defaults on and progress defaults off, with explicit choices retained', () => {
  for (const settings of [undefined, {}, { volume: 20 }]) {
    assert.equal(validateSettings(settings).pauseWhenDesktopHidden, true);
    assert.equal(validateSettings(settings).showProgressBar, false);
  }
  const saved = validateSettings({ pauseWhenDesktopHidden: false, showProgressBar: true });
  assert.equal(saved.pauseWhenDesktopHidden, false);
  assert.equal(saved.showProgressBar, true);
});

test('media allowlist disallows local-network and suffix-confusion targets', () => {
  assert.equal(isMediaUrl('https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/file.m4s'), true);
  for (const value of [
    'http://upos.bilivideo.com/a',
    'https://127.0.0.1/a',
    'https://bilivideo.com.attacker.test/a',
    'https://attackerbilivideo.com/a',
    'https://x:y@upos.bilivideo.com/a',
  ])
    assert.equal(isMediaUrl(value), false);
});
