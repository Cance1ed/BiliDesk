// Optional network integration check. Never reads the user's account or stores credentials.
const { app, session } = require('electron');
const { BilibiliClient, UA } = require('../electron/bilibili.cjs');
app.whenReady().then(async () => {
  const client = new BilibiliClient(async (url, options) => {
    const response = await session.fromPartition('live-check').fetch(url, options);
    if (url.includes('playurl')) {
      const body = await response.clone().json();
      console.log(
        'Available media:',
        JSON.stringify({
          code: body.code,
          keys: Object.keys(body.data || {}),
          videos: body.data?.dash?.video?.map((v) => ({
            id: v.id,
            codec: v.codecid,
            host: new URL(v.baseUrl || v.base_url).host,
          })),
          durlHosts: body.data?.durl?.map((v) => new URL(v.url).host),
        }),
      );
    }
    return response;
  });
  try {
    const user = await client.profile();
    console.log('Anonymous profile:', user === null);
    const qr = await client.qr();
    console.log('QR generated:', !!qr.url && !!qr.qrcode_key);
    const video = await client.resolve('av170001');
    console.log('Metadata:', JSON.stringify({ bvid: video.bvid, cid: video.cid, duration: video.duration }));
    const stream = await client.stream(video, 80);
    console.log('Stream quality:', stream.quality, 'audio:', !!stream.audioUrl);
    const response = await session
      .fromPartition('live-check-media')
      .fetch(stream.videoUrl, {
        headers: { Range: 'bytes=0-1023', Referer: 'https://www.bilibili.com/', 'User-Agent': UA },
      });
    console.log('Media HTTP:', response.status, 'bytes:', (await response.arrayBuffer()).byteLength);
    app.exit(response.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    app.exit(1);
  }
});
