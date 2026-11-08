const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function normalizeCloudSync(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const valid =
    Number.isSafeInteger(value.ownerMid) &&
    value.ownerMid > 0 &&
    Number.isSafeInteger(value.folderId) &&
    value.folderId > 0;
  return {
    ownerMid: valid ? value.ownerMid : 0,
    folderId: valid ? value.folderId : 0,
    title: typeof value.title === 'string' ? value.title.slice(0, 200) : '',
    enabled: valid && value.enabled === true,
    lastSyncAt: Number(value.lastSyncAt) || 0,
    lastError: typeof value.lastError === 'string' ? value.lastError.slice(0, 500) : '',
    addedLast: 0,
  };
}
class CloudSync {
  constructor({ client, getLibrary, getAccount, writeFavorite, save, changed, delay = pause }) {
    Object.assign(this, { client, getLibrary, getAccount, writeFavorite, save, changed, delay });
    this.running = false;
    this.epoch = 0;
    this.timer = null;
    this.periodic = null;
    this.signature = '';
    this.closed = false;
  }
  snapshot() {
    return { ...this.getLibrary().cloudSync, syncing: this.running };
  }
  async configure({ folderId, enabled } = {}) {
    if (typeof enabled !== 'boolean' || !Number.isSafeInteger(folderId) || folderId <= 0)
      throw new Error('请选择目标收藏夹');
    const epoch = this.epoch,
      account = this.getAccount();
    if (!account) throw new Error('请先登录 Bilibili');
    const user = await this.client.profile();
    const folder = await this.client.favorites(folderId, 1);
    if (this.closed || epoch !== this.epoch || account !== this.getAccount())
      throw new Error('账号或播放列表已切换，请重试');
    if (user?.mid !== account || folder.info?.ownerMid !== account || folder.info?.id !== folderId)
      throw new Error('只能同步到当前账号自己的收藏夹');
    this.cancel();
    this.getLibrary().cloudSync = normalizeCloudSync({
      ownerMid: account,
      folderId,
      title: folder.info.title,
      enabled,
    });
    this.signature = '';
    await this.save();
    this.changed();
    this.schedule();
  }
  async disable() {
    this.cancel();
    this.getLibrary().cloudSync.enabled = false;
    await this.save();
    this.changed();
  }
  cancel() {
    this.epoch++;
    clearTimeout(this.timer);
    this.timer = null;
  }
  fingerprint() {
    const s = this.getLibrary().cloudSync;
    return `${s.ownerMid}:${s.folderId}:${[...new Set(this.getLibrary().playlist.map((v) => v.bvid))].sort().join(',')}`;
  }
  schedule() {
    const s = this.getLibrary().cloudSync;
    if (
      this.closed ||
      !s.enabled ||
      s.ownerMid !== this.getAccount() ||
      this.running ||
      this.timer ||
      this.signature === this.fingerprint()
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync().catch(() => {});
    }, 5000);
  }
  async sync() {
    if (this.running) return;
    clearTimeout(this.timer);
    this.timer = null;
    const config = this.getLibrary().cloudSync,
      epoch = this.epoch,
      account = this.getAccount();
    if (!account || config.ownerMid !== account || !config.folderId)
      throw new Error('请登录并选择当前账号的目标收藏夹');
    const valid = () =>
      !this.closed &&
      epoch === this.epoch &&
      this.getAccount() === account &&
      this.getLibrary().cloudSync === config;
    this.running = true;
    this.signature = this.fingerprint();
    config.lastError = '';
    config.addedLast = 0;
    this.changed();
    try {
      const user = await this.client.profile();
      if (!valid()) return;
      if (user?.mid !== account) throw new Error('登录状态已变化，请重新登录并选择收藏夹');
      const existing = new Set();
      for (let page = 1; page <= 500; page++) {
        const remote = await this.client.favorites(config.folderId, page);
        if (!valid()) return;
        if (page === 1 && (remote.info?.ownerMid !== account || remote.info?.id !== config.folderId))
          throw new Error('目标收藏夹不属于当前账号，已停止同步');
        for (const video of remote.videos) existing.add(video.bvid);
        if (!remote.hasMore) break;
        if (page === 500) throw new Error('目标收藏夹内容过多，无法完成安全去重');
        await this.delay(150);
      }
      const videos = [...new Map(this.getLibrary().playlist.map((v) => [v.bvid, v])).values()];
      for (const video of videos) {
        if (!valid()) return;
        if (existing.has(video.bvid) || !this.getLibrary().playlist.some((v) => v.bvid === video.bvid))
          continue;
        const resolved =
          Number.isSafeInteger(video.aid) && video.aid > 0 ? video : await this.client.resolve(video.bvid);
        if (!valid()) return;
        await this.writeFavorite(resolved.aid, config.folderId, account, valid);
        if (!valid()) return;
        config.addedLast++;
        existing.add(video.bvid);
        this.changed();
        await this.delay(500);
      }
      if (valid()) config.lastSyncAt = Date.now();
    } catch (error) {
      if (valid()) config.lastError = error.message;
    } finally {
      this.running = false;
      await this.save();
      this.changed();
      this.schedule();
    }
  }
  start() {
    this.periodic = setInterval(() => {
      if (this.getLibrary().cloudSync.enabled && !this.running) {
        this.signature = '';
        this.schedule();
      }
    }, 15 * 60000);
    this.schedule();
  }
  close() {
    this.closed = true;
    this.cancel();
    clearInterval(this.periodic);
  }
}
module.exports = { CloudSync, normalizeCloudSync };
