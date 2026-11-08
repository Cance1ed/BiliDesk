// Creating a destination never edits, reuses, or deletes an existing account folder.
async function createFavoriteFolder({ client, value, account, valid, getCsrf }) {
  if (!account) throw new Error('请先登录 Bilibili');
  const title = typeof value?.title === 'string' ? value.title.trim() : '';
  if (!title || title.length > 20 || typeof value.private !== 'boolean')
    throw new Error('收藏夹名称需为 1–20 个字符');
  const check = () => {
    if (!valid()) throw new Error('账号或播放列表已切换，请重试');
  };
  check();
  const user = await client.profile();
  check();
  if (user?.mid !== account) throw new Error('登录状态已变化，请重新登录');
  const folders = await client.folders(account);
  check();
  if (folders.some((f) => f.title.trim() === title))
    throw new Error('同名收藏夹已存在，请修改名称或选择已有收藏夹追加保存');
  const csrf = await getCsrf();
  check();
  const created = await client.createFolder(title, value.private, csrf);
  if (!valid()) throw new Error(`收藏夹「${title}」已创建，但账号或播放列表已切换；请刷新收藏夹后选择`);
  if (created.ownerMid !== account) throw new Error('新建收藏夹归属校验失败，请刷新后检查');
  return { id: created.id, title: created.title, count: 0 };
}
module.exports = { createFavoriteFolder };
