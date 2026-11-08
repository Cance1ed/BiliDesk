const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeLibrary } = require('./library.cjs');
class Store {
  constructor(directory) {
    this.directory = directory;
    this.pending = Promise.resolve();
  }
  async load() {
    try {
      const original = await fs.readFile(path.join(this.directory, 'library.json'), 'utf8');
      const data = JSON.parse(original);
      if (data && !Array.isArray(data.playlists)) this.legacySnapshot = original;
      return normalizeLibrary(data);
    } catch {
      return normalizeLibrary();
    }
  }
  save(data) {
    const json = JSON.stringify(data, null, 2);
    const job = this.pending
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(this.directory, { recursive: true });
        if (this.legacySnapshot) {
          try {
            await fs.writeFile(
              path.join(this.directory, 'library.before-multi-playlists.json'),
              this.legacySnapshot,
              { flag: 'wx', mode: 0o600 },
            );
          } catch (error) {
            if (error.code !== 'EEXIST') throw error;
          }
          this.legacySnapshot = null;
        }
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
