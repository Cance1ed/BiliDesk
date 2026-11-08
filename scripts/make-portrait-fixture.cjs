// Generate original, synthetic test videos without downloads or user media.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { backgroundThrottling: false, offscreen: true },
  });
  try {
    await win.loadURL('about:blank');
    for (const [name, width, height] of [
      ['portrait', 360, 640],
      ['landscape', 640, 360],
    ]) {
      const bytes = await win.webContents.executeJavaScript(`(async()=>{
        const c=document.createElement('canvas');c.width=${width};c.height=${height};const ctx=c.getContext('2d');let n=0;
        const draw=()=>{ctx.fillStyle='#173b52';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#55cbb1';ctx.fillRect(c.width*.15,0,c.width*.7,c.height);ctx.fillStyle='#e9e4b7';ctx.beginPath();ctx.arc(c.width/2,c.height*.23,c.width*.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#173b52';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('BiliDesk',c.width/2,c.height*.52);ctx.font='20px sans-serif';ctx.fillText('PORTRAIT TEST',c.width/2,c.height*.59);ctx.fillStyle='#ed7398';ctx.fillRect(c.width*.15,(n++*7)%c.height,c.width*.7,24);};draw();
        const stream=c.captureStream(24),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:500000}),chunks=[];
        const done=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve;});recorder.start();const timer=setInterval(draw,40);await new Promise(r=>setTimeout(r,1800));clearInterval(timer);recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
      })()`);
      const directory = path.join(process.cwd(), 'tests', 'fixtures');
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, name + '.webm'), Buffer.from(bytes));
      console.log(name, bytes.length);
    }
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
