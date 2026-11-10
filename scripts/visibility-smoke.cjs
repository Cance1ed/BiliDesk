const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BrowserWindow, screen } = require('electron');
const { desktopCovered } = require('../electron/visibility-geometry.cjs');
module.exports = async function checkVisibility({
  mainWindow,
  getWindow,
  getPlayback,
  nativeSnapshot,
  setProbe,
  updateVisibility,
  setBlock,
  load,
}) {
  if (process.platform !== 'win32') throw new Error('Native visibility smoke currently requires Windows');
  const execute = (code) => getWindow().webContents.executeJavaScript(code);
  const api = (code) =>
    mainWindow.webContents.executeJavaScript(`(async()=>{const api=window.bilidesk;${code}})()`);
  const settings = (patch) =>
    api(`const s=await api.bootstrap();return api.settings({...s.settings,...${JSON.stringify(patch)}});`);
  const wait = async (predicate, label) => {
    for (let i = 0; i < 80; i++) {
      if (await predicate()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('Visibility smoke timed out: ' + label + ' ' + JSON.stringify(getPlayback()));
  };
  const display = screen.getPrimaryDisplay();
  const cover = new BrowserWindow({
    ...display.workArea,
    show: false,
    frame: true,
    backgroundColor: '#182030',
    webPreferences: { sandbox: true },
  });
  const ids = new Set([String(cover.getNativeWindowHandle().readBigUInt64LE())]);
  // Read real native window visibility/bounds, limiting coverage to our test window so
  // the user's existing desktop apps cannot make a restore assertion nondeterministic.
  setProbe((win, area) => {
    const snapshot = nativeSnapshot(win);
    return (
      snapshot.hidden ||
      desktopCovered(
        area,
        snapshot.rectangles.filter((r) => ids.has(r.id)),
      )
    );
  });
  const stream = (name) => ({
    video: pathToFileURL(path.join(process.cwd(), 'tests/fixtures', name + '.webm')).href,
    audio: null,
    quality: 0,
  });
  try {
    await settings({ pauseOnBattery: false, pauseWhenDesktopHidden: true, showProgressBar: false });
    await load(stream('landscape'));
    await wait(
      async () =>
        (await execute(
          `(()=>{const v=document.querySelector('video');if(v)v.loop=true;return v?.currentTime>.2;})()`,
        )) && getPlayback().status === 'playing',
      'initial play',
    );
    assert.equal(await execute(`document.querySelectorAll('.wallpaper-progress').length`), 0);
    cover.show();
    cover.maximize();
    await wait(() => getPlayback().status === 'paused', 'maximized auto-pause');
    const pausedAt = await execute(`document.querySelector('video').currentTime`);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await execute(`document.querySelector('video').currentTime`), pausedAt);
    cover.minimize();
    await wait(() => getPlayback().status === 'playing', 'minimize resumes');
    assert.ok(
      await execute(`document.querySelector('video').currentTime >= ${pausedAt}`),
      'Resume restarted instead of continuing',
    );
    cover.restore();
    cover.unmaximize();
    cover.setBounds({ x: display.workArea.x + 80, y: display.workArea.y + 80, width: 400, height: 300 });
    updateVisibility();
    assert.equal(getPlayback().status, 'playing');
    cover.setFullScreen(true);
    await wait(() => getPlayback().status === 'paused', 'fullscreen auto-pause');
    await settings({ showProgressBar: true });
    await wait(async () => await execute(`!!document.querySelector('.wallpaper-progress')`), 'progress on');
    await execute(`document.querySelector('video').currentTime=1;`);
    await wait(
      async () =>
        await execute(
          `(()=>{const v=document.querySelector('video');return !v.seeking&&Number(document.querySelector('.wallpaper-progress')?.getAttribute('aria-valuenow'))===Math.round(v.currentTime/v.duration*100);})()`,
        ),
      'progress updates',
    );
    const progress = await execute(
      `(()=>{const p=document.querySelector('.wallpaper-progress'), v=document.querySelector('video'), r=p.getBoundingClientRect();return {height:r.height,top:r.top,width:r.width,viewport:innerWidth,pointer:getComputedStyle(p).pointerEvents,percent:Number(p.getAttribute('aria-valuenow')),expected:Math.round(v.currentTime/v.duration*100)};})()`,
    );
    assert.equal(progress.height, 2);
    assert.equal(progress.top, 0);
    assert.equal(progress.width, progress.viewport);
    assert.equal(progress.pointer, 'none');
    assert.equal(progress.percent, progress.expected);
    if (process.env.BILIDESK_QA_SCREENSHOTS) {
      const fs = require('node:fs/promises');
      await fs.mkdir(process.env.BILIDESK_QA_SCREENSHOTS, { recursive: true });
      await fs.writeFile(
        path.join(process.env.BILIDESK_QA_SCREENSHOTS, 'wallpaper-progress.png'),
        (await getWindow().webContents.capturePage()).toPNG(),
      );
    }
    const frozen = progress.percent;
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(
      await execute(`Number(document.querySelector('.wallpaper-progress').getAttribute('aria-valuenow'))`),
      frozen,
    );
    await load(stream('landscape'));
    await wait(
      async () =>
        await execute(
          `(()=>{const v=document.querySelector('video');if(v)v.loop=true;return v?.readyState>=2&&v.paused&&v.currentTime===0&&document.querySelector('.wallpaper-progress')?.getAttribute('aria-valuenow')==='0';})()`,
        ),
      'new video starts paused behind cover and resets progress',
    );
    assert.equal(getPlayback().status, 'paused');
    // Disabling just this option must resume its pause, preserving other pause sources.
    await settings({ pauseWhenDesktopHidden: false });
    await wait(() => getPlayback().status === 'playing', 'opt-out resumes');
    await api('await api.pause();');
    await settings({ pauseWhenDesktopHidden: true });
    cover.setFullScreen(false);
    cover.hide();
    updateVisibility();
    assert.equal(getPlayback().status, 'paused', 'Visibility restored a manual pause');
    await api('await api.pause();');
    await wait(() => getPlayback().status === 'playing', 'manual resume');
    cover.show();
    cover.maximize();
    await wait(() => getPlayback().status === 'paused', 'covered again');
    setBlock('lock-test', true);
    cover.minimize();
    updateVisibility();
    assert.equal(getPlayback().status, 'paused', 'Visibility ignored another system blocker');
    setBlock('lock-test', false);
    await wait(() => getPlayback().status === 'playing', 'unblock resumes');
    await load(stream('portrait'));
    await wait(
      async () => await execute(`document.querySelector('.media-player')?.dataset.columns==='3'`),
      'portrait progress',
    );
    assert.equal(await execute(`document.querySelectorAll('.wallpaper-progress').length`), 1);
    await settings({ showProgressBar: false });
    await wait(async () => await execute(`!document.querySelector('.wallpaper-progress')`), 'progress off');
    await api('await api.stop();');
    cover.restore();
    cover.hide();
    updateVisibility();
    assert.equal(getPlayback().status, 'stopped');
    assert.equal(getWindow(), null);
    console.log(
      'BILIDESK_VISIBILITY ' +
        JSON.stringify({
          nativeMaximized: true,
          nativeFullscreen: true,
          partialKeepsPlaying: true,
          minimizedResumesAtPosition: true,
          manualPausePreserved: true,
          combinedBlocks: true,
          optOut: true,
          stopPreserved: true,
          progress,
          progressPaused: true,
          hiddenLoadPaused: true,
          progressTiled: true,
          progressOff: true,
        }),
    );
  } finally {
    if (!cover.isDestroyed()) cover.destroy();
  }
};
