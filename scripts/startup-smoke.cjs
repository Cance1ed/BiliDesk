// Isolated startup scenarios: the application's normal startup code must initiate playback.
const { session } = require('electron');
const { BilibiliClient } = require('../electron/bilibili.cjs');
const assert = require('node:assert/strict');
async function seed(store, scenario) {
  if (!['enabled', 'disabled', 'empty'].includes(scenario)) throw new Error('Unknown startup scenario');
  const client = new BilibiliClient((url, options) =>
    session.fromPartition('startup-smoke').fetch(url, options),
  );
  const playlist = scenario === 'empty' ? [] : [await client.resolve('av170001')];
  // Omit the setting in enabled mode to exercise upgrade migration, not just a fresh explicit true.
  await store.save({
    settings: {
      pauseOnBattery: false,
      pauseWhenDesktopHidden: false,
      ...(scenario === 'disabled' ? { autoPlayOnLaunch: false } : {}),
    },
    playlist,
  });
}
async function verify({ scenario, getWindow, getPlayback, store }) {
  const saved = await store.load();
  assert.equal(saved.settings.autoPlayOnLaunch, scenario !== 'disabled');
  if (scenario !== 'enabled') {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.equal(getPlayback().status, 'stopped');
    assert.ok(!getWindow());
    console.log('BILIDESK_STARTUP ' + JSON.stringify({ scenario, started: false, noWallpaperWindow: true }));
    return;
  }
  let frames;
  for (let i = 0; i < 150; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (getPlayback().status === 'error') throw new Error(getPlayback().error);
    if (getWindow() && getPlayback().status === 'playing') {
      frames = await getWindow().webContents.executeJavaScript(
        `(()=>{const v=document.querySelector('video');return v?{time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames}:null;})()`,
      );
      if (frames?.time > 2 && frames.frames > 5) break;
    }
  }
  assert.ok(
    frames?.time > 2 && frames.frames > 5,
    'Startup did not produce advancing video without manual start',
  );
  assert.equal(getPlayback().currentId, saved.playlist[0].id);
  console.log('BILIDESK_STARTUP ' + JSON.stringify({ scenario, started: true, firstVideo: true, ...frames }));
}
module.exports = { seed, verify };
