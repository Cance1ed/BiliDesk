const { parseVideoInput, signWbi, normalizeImage, isMediaUrl } = require('./core.cjs');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
class BilibiliClient {
  constructor(fetcher) {
    this.fetch = fetcher;
    this.wbi = null;
  }
  async request(path, params = {}, { passport = false, allowAnonymous = false, method = 'GET' } = {}) {
    const base = passport ? 'https://passport.bilibili.com' : 'https://api.bilibili.com';
    const query = typeof params === 'string' ? params : new URLSearchParams(params).toString();
    const response = await this.fetch(`${base}${path}${method === 'GET' ? `?${query}` : ''}`, {
      method,
      ...(method === 'POST' ? { body: query } : {}),
      credentials: 'include',
      headers: {
        'User-Agent': UA,
        Referer: 'https://www.bilibili.com/',
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Bilibili 请求失败（HTTP ${response.status}），请稍后重试`);
    const body = await response.json();
    if (body.code !== 0 && !(allowAnonymous && body.code === -101)) {
      const message = {
        '-101': '登录已过期，请重新扫码登录',
        '-111': '登录校验已失效，请重新扫码登录',
        '-403': '无权访问此内容',
        '-404': '视频不存在或已被删除',
        '-412': 'Bilibili 暂时限制了请求，请稍后再试',
      }[body.code];
      throw new Error(message || `Bilibili：${body.message || '请求失败'}（${body.code}）`);
    }
    if (body.data?.v_voucher) throw new Error('Bilibili 需要验证，请在浏览器访问 Bilibili 后稍后重试');
    return body.data;
  }
  async profile() {
    const data = await this.request('/x/web-interface/nav', {}, { allowAnonymous: true });
    if (data?.wbi_img) this.wbi = { ...data.wbi_img, time: Date.now() };
    return data?.isLogin ? { mid: data.mid, name: data.uname, avatar: normalizeImage(data.face) } : null;
  }
  async qr() {
    return this.request('/x/passport-login/web/qrcode/generate', {}, { passport: true });
  }
  async poll(key) {
    return this.request('/x/passport-login/web/qrcode/poll', { qrcode_key: key }, { passport: true });
  }
  async resolve(input) {
    let id = parseVideoInput(input);
    if (id.short) {
      let target = id.short;
      for (let i = 0; i < 4; i++) {
        const response = await this.fetch(target, {
          redirect: 'manual',
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(15000),
        });
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('短链接无效或已过期');
        target = new URL(location, target).href;
        id = parseVideoInput(target);
        if (!id.short) break;
      }
      if (id.short) throw new Error('短链接重定向过多');
    }
    const data = await this.request('/x/web-interface/view', id.bvid ? { bvid: id.bvid } : { aid: id.aid });
    const part = data.pages?.find((p) => p.page === id.page);
    if (!part) throw new Error(`该视频没有第 ${id.page} P`);
    return {
      id: `${data.bvid}:${part.cid}`,
      bvid: data.bvid,
      aid: data.aid,
      cid: part.cid,
      page: part.page,
      title: data.pages.length > 1 ? `${data.title} · P${part.page} ${part.part}` : data.title,
      cover: normalizeImage(data.pic),
      duration: part.duration,
      owner: data.owner?.name || '',
      url: `https://www.bilibili.com/video/${data.bvid}/?p=${part.page}`,
    };
  }
  async folders(mid) {
    const data = await this.request('/x/v3/fav/folder/created/list-all', { up_mid: mid });
    return (data?.list || []).map((f) => ({ id: f.id, title: f.title, count: f.media_count }));
  }
  async collections(mid, page = 1) {
    const data = await this.request('/x/v3/fav/folder/collected/list', {
      up_mid: mid,
      pn: page,
      ps: 20,
      platform: 'web',
    });
    return {
      hasMore: !!data?.has_more || page * 20 < (data?.count || 0),
      collections: (data?.list || [])
        .filter((v) => v.type === 21 && v.state === 0)
        .map((v) => ({
          id: v.id,
          ownerMid: v.mid || v.upper?.mid,
          owner: v.upper?.name || '',
          title: v.title,
          cover: normalizeImage(v.cover),
          count: v.media_count,
        })),
    };
  }
  async collectionVideos(id, ownerMid, page = 1) {
    const data = await this.request('/x/polymer/web-space/seasons_archives_list', {
      mid: ownerMid,
      season_id: id,
      page_num: page,
      page_size: 30,
      sort_reverse: false,
    });
    if (!data?.meta || Number(data.meta.season_id) !== id || Number(data.meta.mid) !== ownerMid)
      throw new Error('合集不存在或归属不匹配');
    return {
      title: data.meta.title || data.meta.name,
      hasMore: page * 30 < (data.page?.total || data.meta.total || 0),
      videos: (data.archives || [])
        .filter((v) => v.bvid && v.state === 0)
        .map((v) => ({
          bvid: v.bvid,
          title: v.title,
          cover: normalizeImage(v.pic),
          duration: v.duration,
          owner: '',
        })),
    };
  }
  async addFavorite(aid, folderId, csrf) {
    if (!Number.isSafeInteger(aid) || aid <= 0 || !Number.isSafeInteger(folderId) || folderId <= 0 || !csrf)
      throw new Error('收藏参数或登录状态无效');
    return this.request(
      '/x/v3/fav/resource/deal',
      { rid: aid, type: 2, add_media_ids: folderId, csrf, platform: 'web' },
      { method: 'POST' },
    );
  }
  async createFolder(title, isPrivate, csrf) {
    if (
      typeof title !== 'string' ||
      !title.trim() ||
      title.trim().length > 20 ||
      typeof isPrivate !== 'boolean' ||
      !csrf
    )
      throw new Error('收藏夹参数或登录状态无效');
    let data;
    try {
      data = await this.request(
        '/x/v3/fav/folder/add',
        { title: title.trim(), privacy: isPrivate ? 1 : 0, csrf },
        { method: 'POST' },
      );
    } catch (error) {
      throw new Error(`新建结果未确认，请刷新收藏夹检查后再试：${error.message}`);
    }
    if (!Number.isSafeInteger(data?.id) || data.id <= 0)
      throw new Error('未收到新建收藏夹编号，请刷新收藏夹检查后再试');
    return { id: data.id, title: data.title || title.trim(), ownerMid: Number(data.mid || data.upper?.mid) };
  }
  async favorites(folderId, page) {
    const data = await this.request('/x/v3/fav/resource/list', {
      media_id: folderId,
      pn: page,
      ps: 20,
      platform: 'web',
      order: 'mtime',
      type: 0,
    });
    if (!data) throw new Error('收藏夹不存在，或当前账号无法访问');
    return {
      hasMore: !!data.has_more,
      info: data.info
        ? {
            id: Number(data.info.id),
            ownerMid: Number(data.info.mid || data.info.upper?.mid),
            ownerName: data.info.upper?.name || '',
            title: data.info.title,
            count: data.info.media_count,
          }
        : null,
      videos: (data.medias || [])
        .filter((v) => v.type === 2 && v.bvid && v.title !== '已失效视频')
        .map((v) => ({
          bvid: v.bvid,
          title: v.title,
          cover: normalizeImage(v.cover),
          duration: v.duration,
          owner: v.upper?.name || '',
        })),
    };
  }
  async stream(video, quality) {
    if (!this.wbi || Date.now() - this.wbi.time > 3600000) await this.profile();
    if (!this.wbi) throw new Error('暂时无法获取播放签名，请重试');
    const key = (url) => new URL(url).pathname.split('/').pop().split('.')[0];
    const query = signWbi(
      { bvid: video.bvid, cid: video.cid, qn: quality, fnval: 16, fnver: 0, fourk: quality === 120 ? 1 : 0 },
      key(this.wbi.img_url),
      key(this.wbi.sub_url),
    );
    const data = await this.request('/x/player/wbi/playurl', query);
    if (data.is_preview) throw new Error('此视频仅提供试看，无法作为完整动态壁纸播放');
    const videos = (data.dash?.video || [])
      .filter((v) => v.codecid === 7 && v.id <= quality)
      .sort((a, b) => b.id - a.id || b.bandwidth - a.bandwidth);
    const audio = (data.dash?.audio || []).sort((a, b) => b.bandwidth - a.bandwidth)[0];
    const videoUrl = (videos[0]?.baseUrl || videos[0]?.base_url || data.durl?.[0]?.url)?.replace(
      /^http:/,
      'https:',
    );
    const audioUrl = (audio?.baseUrl || audio?.base_url)?.replace(/^http:/, 'https:');
    if (!videoUrl || !isMediaUrl(videoUrl) || (audioUrl && !isMediaUrl(audioUrl)))
      throw new Error('没有可播放的视频流，可能需要登录或当前账号没有权限');
    return {
      videoUrl,
      audioUrl,
      quality: videos[0]?.id || data.quality,
      duration: data.dash?.duration || data.timelength / 1000,
    };
  }
}
module.exports = { BilibiliClient, UA };
