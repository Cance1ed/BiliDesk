const INTERVALS = [15, 60, 360, 1440];
function positiveId(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('请输入有效的 UID 或收藏夹编号');
  return number;
}
function parseSubscriptionTarget(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('请输入 UP 主 UID、主页或收藏夹链接');
  const input = value.trim();
  if (/^\d+$/.test(input)) return { ownerMid: positiveId(input) };
  let url;
  try {
    url = new URL(input.startsWith('https://') || input.startsWith('http://') ? input : `https://${input}`);
  } catch {
    throw new Error('请输入 UP 主 UID 或 space.bilibili.com 主页 / 收藏夹链接');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname !== 'space.bilibili.com'
  )
    throw new Error('仅支持 space.bilibili.com 的主页或收藏夹链接，也可直接输入 UID');
  const match = url.pathname.match(/^\/(\d+)(?:\/(?:favlist|fav))?\/?$/);
  if (!match) throw new Error('请使用 UP 主主页或包含 fid 的收藏夹链接');
  return {
    ownerMid: positiveId(match[1]),
    ...(url.searchParams.has('fid') ? { folderId: positiveId(url.searchParams.get('fid')) } : {}),
  };
}
function normalizeSubscriptions(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value
    .filter(
      (s) =>
        s &&
        Number.isSafeInteger(s.ownerMid) &&
        s.ownerMid > 0 &&
        Number.isSafeInteger(s.folderId) &&
        s.folderId > 0 &&
        !ids.has(s.folderId) &&
        ids.add(s.folderId),
    )
    .slice(0, 20)
    .map((s) => ({
      id: String(s.folderId),
      folderId: s.folderId,
      ownerMid: s.ownerMid,
      ownerName: typeof s.ownerName === 'string' ? s.ownerName.slice(0, 100) : '',
      title: typeof s.title === 'string' ? s.title.slice(0, 200) : '收藏夹',
      intervalMinutes: INTERVALS.includes(s.intervalMinutes) ? s.intervalMinutes : 60,
      enabled: s.enabled !== false,
      lastSyncAt: Number.isFinite(s.lastSyncAt) && s.lastSyncAt > 0 ? s.lastSyncAt : 0,
      lastAttemptAt: Number.isFinite(s.lastAttemptAt) && s.lastAttemptAt > 0 ? s.lastAttemptAt : 0,
      lastError: typeof s.lastError === 'string' ? s.lastError.slice(0, 500) : '',
      videoCount: Number.isSafeInteger(s.videoCount) && s.videoCount >= 0 ? s.videoCount : 0,
      addedLast: Number.isSafeInteger(s.addedLast) && s.addedLast >= 0 ? s.addedLast : 0,
      knownBvids: [
        ...new Set(
          (Array.isArray(s.knownBvids) ? s.knownBvids : []).filter((id) => /^BV[\da-zA-Z]{10}$/.test(id)),
        ),
      ].slice(0, 10000),
    }));
}
class SubscriptionManager {
  constructor({ client, getLibrary, save, changed, now = Date.now }) {
    Object.assign(this, { client, getLibrary, save, changed, now });
    this.running = new Set();
    this.timer = null;
    this.closed = false;
  }
  snapshot() {
    return this.getLibrary().subscriptions.map(({ knownBvids, ...s }) => ({
      ...s,
      syncing: this.running.has(s.id),
    }));
  }
  async discover(input) {
    const target = parseSubscriptionTarget(input);
    if (target.folderId) {
      const page = await this.client.favorites(target.folderId, 1);
      this.assertOwner(page, target.ownerMid, target.folderId);
      return {
        ownerMid: target.ownerMid,
        ownerName: page.info.ownerName,
        folders: [{ id: target.folderId, title: page.info.title, count: page.info.count }],
        selectedFolderId: target.folderId,
      };
    }
    return {
      ownerMid: target.ownerMid,
      ownerName: '',
      folders: await this.client.folders(target.ownerMid),
      selectedFolderId: 0,
    };
  }
  assertOwner(page, ownerMid, folderId) {
    if (!page.info || page.info.ownerMid !== ownerMid || page.info.id !== folderId)
      throw new Error('收藏夹不属于指定 UP 主，或当前账号无法访问');
  }
  async add({ ownerMid, folderId, intervalMinutes = 60 } = {}) {
    ownerMid = positiveId(ownerMid);
    folderId = positiveId(folderId);
    if (!INTERVALS.includes(intervalMinutes)) throw new Error('无效同步间隔');
    const check = () => {
      if (this.closed) throw new Error('播放列表已切换，请重试');
      if (this.getLibrary().subscriptions.some((s) => s.folderId === folderId))
        throw new Error('已订阅这个收藏夹');
      if (this.getLibrary().subscriptions.length >= 20) throw new Error('最多订阅 20 个收藏夹');
    };
    check();
    const first = await this.client.favorites(folderId, 1);
    this.assertOwner(first, ownerMid, folderId);
    check();
    const subscription = normalizeSubscriptions([
      { ownerMid, folderId, intervalMinutes, ownerName: first.info.ownerName, title: first.info.title },
    ])[0];
    this.getLibrary().subscriptions.push(subscription);
    try {
      await this.save();
    } catch (error) {
      this.getLibrary().subscriptions = this.getLibrary().subscriptions.filter((s) => s !== subscription);
      throw error;
    }
    this.changed();
    void this.sync(subscription.id, first).catch(() => {});
    return subscription.id;
  }
  async update(id, { enabled, intervalMinutes } = {}) {
    const s = this.getLibrary().subscriptions.find((s) => s.id === id);
    if (!s) throw new Error('订阅不存在');
    if (typeof enabled !== 'boolean' || !INTERVALS.includes(intervalMinutes)) throw new Error('无效订阅设置');
    Object.assign(s, { enabled, intervalMinutes });
    await this.save();
    this.changed();
  }
  async remove(id) {
    this.getLibrary().subscriptions = this.getLibrary().subscriptions.filter((s) => s.id !== id);
    await this.save();
    this.changed();
  }
  async sync(id, firstPage) {
    const subscription = this.getLibrary().subscriptions.find((s) => s.id === id);
    if (!subscription) throw new Error('订阅不存在');
    if (this.running.has(id)) return;
    const valid = () =>
      !this.closed && this.getLibrary().subscriptions.includes(subscription) && subscription.enabled;
    if (!valid()) return;
    this.running.add(id);
    subscription.lastAttemptAt = this.now();
    subscription.lastError = '';
    subscription.addedLast = 0;
    this.changed();
    try {
      const remote = new Map();
      let info;
      // Fetch all pages before changing membership: a later page failing must not mark unseen videos as seen.
      for (let pageNumber = 1; pageNumber <= 500; pageNumber++) {
        const page =
          pageNumber === 1 && firstPage
            ? firstPage
            : await this.client.favorites(subscription.folderId, pageNumber);
        if (!valid()) return;
        if (pageNumber === 1) {
          this.assertOwner(page, subscription.ownerMid, subscription.folderId);
          info = page.info;
        }
        for (const v of page.videos) remote.set(v.bvid, v);
        if (!page.hasMore) break;
        if (pageNumber === 500) throw new Error('收藏夹超过 10000 个内容，请改用较小的收藏夹');
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const known = new Set(subscription.knownBvids);
      const errors = [];
      for (const video of remote.values()) {
        if (!valid()) return;
        if (known.has(video.bvid)) continue;
        if (this.getLibrary().playlist.some((v) => v.bvid === video.bvid && v.page === 1)) {
          known.add(video.bvid);
          subscription.knownBvids = [...known];
          continue;
        }
        if (this.getLibrary().playlist.length >= 1000) {
          errors.push('播放列表已达 1000 个上限，剩余视频将在腾出空间后重试');
          break;
        }
        try {
          const resolved = await this.client.resolve(video.bvid);
          if (!valid()) return;
          const playlist = this.getLibrary().playlist;
          if (!playlist.some((v) => v.id === resolved.id)) {
            if (playlist.length >= 1000) {
              errors.push('播放列表已满');
              break;
            }
            playlist.push(resolved);
            subscription.addedLast++;
          }
          known.add(video.bvid);
          subscription.knownBvids = [...known];
        } catch (error) {
          errors.push(`${video.bvid}：${error.message}`);
          if (/HTTP (412|429)|限制了请求|需要验证/.test(error.message)) break;
        }
        this.changed();
        // Bound request bursts and allow cancellation between metadata requests.
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (!valid()) return;
      Object.assign(subscription, {
        title: info.title,
        ownerName: info.ownerName,
        videoCount: remote.size,
        lastSyncAt: this.now(),
        lastError: errors.length
          ? `${errors.length} 项未完成：${errors.slice(0, 3).join('；')}`.slice(0, 500)
          : '',
      });
    } catch (error) {
      if (this.getLibrary().subscriptions.includes(subscription)) subscription.lastError = error.message;
    } finally {
      this.running.delete(id);
      try {
        await this.save();
      } catch (error) {
        subscription.lastError = `保存订阅失败：${error.message}`;
      }
      this.changed();
    }
  }
  async tick() {
    for (const s of [...this.getLibrary().subscriptions]) {
      if (this.closed) return;
      if (s.enabled && !this.running.has(s.id) && this.now() - s.lastAttemptAt >= s.intervalMinutes * 60000)
        await this.sync(s.id);
    }
  }
  start() {
    this.timer = setInterval(() => void this.tick().catch(() => {}), 60000);
    void this.tick().catch(() => {});
  }
  close() {
    this.closed = true;
    clearInterval(this.timer);
  }
}
module.exports = { SubscriptionManager, normalizeSubscriptions, parseSubscriptionTarget };
