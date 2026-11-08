const { pathToFileURL } = require('node:url');
const path = require('node:path');
module.exports = async function checkPortrait({ window, send, settings, generation }) {
  const execute = (code) => window.webContents.executeJavaScript(code);
  const wait = async (condition) => {
    for (let i = 0; i < 100; i++) {
      const result = await execute(condition);
      if (result) return result;
      await new Promise((r) => setTimeout(r, 100));
    }
    console.log(
      'PORTRAIT_DIAGNOSTIC',
      await execute(
        `(()=>{const v=document.querySelector('video');return {error:v?.error?.message,src:v?.src,width:v?.videoWidth,height:v?.videoHeight,time:v?.currentTime,paused:v?.paused,columns:document.querySelector('.media-player')?.dataset.columns};})()`,
      ),
    );
    throw new Error('Portrait rendering condition timed out: ' + condition);
  };
  const load = (name, id) =>
    send({
      type: 'load',
      generation: id,
      settings: { ...settings, portraitColumns: 0, volume: 0 },
      stream: {
        video: pathToFileURL(path.join(process.cwd(), 'tests', 'fixtures', name + '.webm')).href,
        audio: null,
        quality: 0,
      },
    });
  load('portrait', generation);
  await wait(
    `(()=>{const v=document.querySelector('video');if(v)v.loop=true;return v?.videoWidth===360&&document.querySelector('.media-player')?.dataset.columns==='3'&&v.currentTime>.3;})()`,
  );
  send({ type: 'pause' });
  await wait(`document.querySelector('video')?.paused`);
  const check = await execute(
    `(()=>{const c=document.querySelector('.portrait-tiles'),ctx=c.getContext('2d');const samples=[0,1,2].map(i=>Array.from(ctx.getImageData(Math.round((i+.5)*c.width/3),Math.round(c.height*.4),1,1).data));return {width:c.width,height:c.height,columns:3,samples,videoElements:document.querySelectorAll('video').length,time:document.querySelector('video').currentTime};})()`,
  );
  if (
    check.videoElements !== 1 ||
    check.samples.some((sample) => sample.join(',') !== check.samples[0].join(',')) ||
    check.samples[0].slice(0, 3).every((x) => x === 0)
  )
    throw new Error('Tiles are not identical decoded video pixels');
  await new Promise((r) => setTimeout(r, 300));
  const pausedTime = await execute(`document.querySelector('video').currentTime`);
  if (pausedTime !== check.time) throw new Error('Pause did not freeze source');
  send({ type: 'settings', settings: { ...settings, portraitColumns: 4 } });
  await wait(`document.querySelector('.media-player')?.dataset.columns==='4'`);
  send({ type: 'settings', settings: { ...settings, portraitColumns: -1 } });
  await wait(`document.querySelector('.media-player')?.dataset.columns==='1'`);
  send({ type: 'settings', settings: { ...settings, portraitColumns: 0 } });
  await wait(`document.querySelector('.media-player')?.dataset.columns==='3'`);
  send({ type: 'resume' });
  await wait(`document.querySelector('video').currentTime>${pausedTime + 0.15}`);
  load('landscape', generation + 1);
  await wait(
    `(()=>{const v=document.querySelector('video');if(v)v.loop=true;return v?.videoWidth===640&&document.querySelector('.media-player')?.dataset.columns==='1';})()`,
  );
  console.log(
    'BILIDESK_PORTRAIT ' +
      JSON.stringify({ ...check, manualFour: true, disabled: true, resumed: true, landscapeRestored: true }),
  );
};
