const test = require('node:test');
const assert = require('node:assert/strict');
const { createFavoriteFolder } = require('../electron/favorite-folder.cjs');
function fixture() {
  const existing = [{ id: 1, title: '珍藏', videos: ['keep'] }],
    writes = [];
  const f = {
    account: 123,
    value: { title: '新的壁纸', private: true },
    valid: () => true,
    getCsrf: async () => 'fixture',
    client: {
      profile: async () => ({ mid: 123 }),
      folders: async () => existing,
      createFolder: async (title, privateValue, csrf) => {
        writes.push({ title, privateValue, csrf });
        return { id: 2, title, ownerMid: 123 };
      },
    },
  };
  return { f, existing, writes };
}
test('new destination is created privately without mutating existing folders', async () => {
  const { f, existing, writes } = fixture();
  assert.deepEqual(await createFavoriteFolder(f), { id: 2, title: '新的壁纸', count: 0 });
  assert.deepEqual(existing, [{ id: 1, title: '珍藏', videos: ['keep'] }]);
  assert.deepEqual(writes, [{ title: '新的壁纸', privateValue: true, csrf: 'fixture' }]);
});
test('same-name, invalid title and stale identity do not write or reuse an existing folder', async () => {
  const { f, writes } = fixture();
  f.value.title = ' 珍藏 ';
  await assert.rejects(createFavoriteFolder(f), /同名/);
  f.value.title = 123;
  await assert.rejects(createFavoriteFolder(f), /名称/);
  f.value.title = '新的壁纸';
  f.client.profile = async () => ({ mid: 999 });
  await assert.rejects(createFavoriteFolder(f), /登录状态/);
  assert.equal(writes.length, 0);
});
test('switching playlists while awaiting CSRF cancels folder creation', async () => {
  const { f, writes } = fixture();
  let valid = true;
  f.valid = () => valid;
  f.getCsrf = async () => {
    valid = false;
    return 'fixture';
  };
  await assert.rejects(createFavoriteFolder(f), /切换/);
  assert.equal(writes.length, 0);
});
test('uncertain create result is never automatically retried', async () => {
  const { f } = fixture();
  let calls = 0;
  f.client.createFolder = async () => {
    calls++;
    throw new Error('timeout');
  };
  await assert.rejects(createFavoriteFolder(f), /timeout/);
  assert.equal(calls, 1);
});
