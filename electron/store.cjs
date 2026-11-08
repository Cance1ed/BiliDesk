const fs = require('node:fs/promises');
const path = require('node:path');
const { defaults, validateSettings } = require('./core.cjs');
const { normalizeSubscriptions } = require('./subscriptions.cjs');
const { normalizeCloudSync } = require('./cloud-sync.cjs');
class Store {
  constructor(directory) {
    this.directory = directory;
    this.pending = Promise.resolve();
  }
  async load() {
    try {
      const data = JSON.parse(await fs.readFile(path.join(this.directory, 'library.json'), 'utf8'));
      const playlist = Array.isArray(data.playlist)
        ? data.playlist
            .filter(
              (v) =>
                /^BV[\da-zA-Z]{10}$/.test(v.bvid) &&
                Number.isSafeInteger(v.cid) &&
                v.cid > 0 &&
                v.id === `${v.bvid}:${v.cid}` &&
                typeof v.title === 'string',
            )
            .slice(0, 1000)
        : [];
      return {
        playlist,
        settings: validateSettings(data.settings),
        subscriptions: normalizeSubscriptions(data.subscriptions),
        cloudSync: normalizeCloudSync(data.cloudSync),
      };
    } catch {
      return { playlist: [], settings: { ...defaults }, subscriptions: [], cloudSync: normalizeCloudSync() };
    }
  }
  save(data) {
    const json = JSON.stringify(data, null, 2);
    const job = this.pending
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(this.directory, { recursive: true });
        const target = path.join(this.directory, 'library.json');
        await fs.writeFile(target + '.tmp', json, { mode: 0o600 });
        await fs.rename(target + '.tmp', target);
      });
    this.pending = job;
    return job;
  }
  async saveAuth(cookies, safeStorage) {
    if (!(await safeStorage.isAsyncEncryptionAvailable()))
      throw new Error('系统凭据加密不可用，本次登录不会保存到磁盘');
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(
      path.join(this.directory, 'account.enc'),
      await safeStorage.encryptStringAsync(JSON.stringify(cookies)),
      { mode: 0o600 },
    );
  }
  async restoreAuth(session, safeStorage) {
    try {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) return;
      const encrypted = await fs.readFile(path.join(this.directory, 'account.enc'));
      const decrypted = await safeStorage.decryptStringAsync(encrypted);
      const cookies = JSON.parse(decrypted.result);
      if (decrypted.shouldReEncrypt) await this.saveAuth(cookies, safeStorage);
      for (const cookie of cookies) {
        if (
          !['bilibili.com', '.bilibili.com', 'passport.bilibili.com', '.passport.bilibili.com'].includes(
            cookie.domain,
          )
        )
          continue;
        if (cookie.expirationDate && cookie.expirationDate < Date.now() / 1000) continue;
        const { name, value, domain, path: cookiePath, secure, httpOnly, expirationDate, sameSite } = cookie;
        await session.cookies.set({
          url: `https://${domain.replace(/^\./, '')}${cookiePath}`,
          name,
          value,
          domain,
          path: cookiePath,
          secure,
          httpOnly,
          expirationDate,
          sameSite,
        });
      }
    } catch {
      /* Missing, expired or undecryptable credentials require a fresh login. */
    }
  }
  async clearAuth() {
    await fs.rm(path.join(this.directory, 'account.enc'), { force: true });
  }
}
module.exports = { Store };
