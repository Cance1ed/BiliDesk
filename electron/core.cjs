const { createHash } = require('node:crypto');
const MIXIN = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39,
  12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63,
  57, 62, 11, 36, 20, 34, 44, 52,
];
const defaults = {
  mode: 'sequence',
  displayId: 'primary',
  volume: 0,
  fit: 'cover',
  portraitColumns: 0,
  interval: 0,
  quality: 80,
  pauseOnBattery: true,
  launchAtLogin: false,
  autoPlayOnLaunch: true,
};
function parseVideoInput(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('视频链接格式不正确');
  const raw = input.trim();
  if (/^BV[0-9A-Za-z]{10}$/.test(raw)) return { bvid: raw, page: 1 };
  if (/^av\d+$/i.test(raw)) return { aid: raw.slice(2), page: 1 };
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error('请输入 Bilibili 视频链接或 BV 号');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port)
    throw new Error('不支持此链接');
  if (url.hostname === 'b23.tv') return { short: url.href.replace(/^http:/, 'https:') };
  if (!['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(url.hostname))
    throw new Error('仅支持 bilibili.com 和 b23.tv 视频链接');
  const match = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10}|av\d+)\/?$/i);
  if (!match) throw new Error('链接中没有有效的视频编号');
  const page = Number(url.searchParams.get('p') || 1);
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('分 P 编号不正确');
  return {
    ...(match[1].slice(0, 2).toUpperCase() === 'BV'
      ? { bvid: 'BV' + match[1].slice(2) }
      : { aid: match[1].slice(2) }),
    page,
  };
}
function signWbi(params, imgKey, subKey, time = Math.floor(Date.now() / 1000)) {
  const key = MIXIN.map((i) => (imgKey + subKey)[i])
    .join('')
    .slice(0, 32);
  const values = { ...params, wts: time };
  const query = Object.keys(values)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(values[k]).replace(/[!'()*]/g, ''))}`)
    .join('&');
  return `${query}&w_rid=${createHash('md5')
    .update(query + key)
    .digest('hex')}`;
}
function nextIndex(length, current, mode, random = Math.random) {
  if (!length) return -1;
  if (current < 0 || current >= length) return 0;
  if (mode === 'single' || length === 1) return current;
  if (mode === 'shuffle') return (current + 1 + Math.floor(random() * (length - 1))) % length;
  return (current + 1) % length;
}
function validateSettings(input = {}) {
  const s = { ...defaults, ...input };
  if (!['sequence', 'shuffle', 'single'].includes(s.mode)) throw new Error('无效播放模式');
  if (!['cover', 'contain'].includes(s.fit)) throw new Error('无效画面比例');
  if (![-1, 0, 2, 3, 4, 5, 6, 7, 8].includes(s.portraitColumns)) throw new Error('无效竖屏联屏设置');
  if (typeof s.displayId !== 'string' || s.displayId.length > 32) throw new Error('无效屏幕');
  if (!Number.isFinite(s.volume) || s.volume < 0 || s.volume > 100) throw new Error('音量应为 0–100');
  if (![0, 60, 300, 900, 1800].includes(s.interval)) throw new Error('无效轮播间隔');
  if (![32, 64, 80, 120].includes(s.quality)) throw new Error('无效清晰度');
  if (
    typeof s.pauseOnBattery !== 'boolean' ||
    typeof s.launchAtLogin !== 'boolean' ||
    typeof s.autoPlayOnLaunch !== 'boolean'
  )
    throw new Error('无效设置');
  return Object.fromEntries(Object.keys(defaults).map((k) => [k, s[k]]));
}
function isMediaUrl(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      ['bilivideo.com', 'bilivideo.cn', 'bilivideo.net'].some(
        (d) => u.hostname === d || u.hostname.endsWith('.' + d),
      )
    );
  } catch {
    return false;
  }
}
function normalizeImage(value) {
  try {
    const u = new URL(value.replace(/^http:/, 'https:'));
    return ['hdslb.com', 'biliimg.com'].some((d) => u.hostname.endsWith('.' + d)) && u.protocol === 'https:'
      ? u.href
      : '';
  } catch {
    return '';
  }
}
module.exports = {
  defaults,
  parseVideoInput,
  signWbi,
  nextIndex,
  validateSettings,
  isMediaUrl,
  normalizeImage,
};
