const { randomUUID } = require('node:crypto');
const { defaults, validateSettings } = require('./core.cjs');
const { normalizeSubscriptions } = require('./subscriptions.cjs');
const { normalizeCloudSync } = require('./cloud-sync.cjs');
const MAX_PLAYLISTS = 20;
function cleanVideos(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .filter(
      (v) =>
        v &&
        /^BV[\da-zA-Z]{10}$/.test(v.bvid) &&
        Number.isSafeInteger(v.cid) &&
        v.cid > 0 &&
        v.id === `${v.bvid}:${v.cid}` &&
        typeof v.title === 'string' &&
        !seen.has(v.id) &&
        seen.add(v.id),
    )
    .slice(0, 1000);
}
function playlistName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60)
    throw new Error('播放列表名称需为 1–60 个字符');
  return value.trim();
}
function activePlaylist(library) {
  return library.playlists.find((p) => p.id === library.activePlaylistId) || library.playlists[0];
}
function normalizeLibrary(data = {}) {
  if (!data || typeof data !== 'object') data = {};
  const seen = new Set();
  const raw =
    Array.isArray(data.playlists) && data.playlists.length
      ? data.playlists
      : [
          {
            id: 'default',
            name: '默认播放列表',
            playlist: data.playlist,
            subscriptions: data.subscriptions,
            cloudSync: data.cloudSync,
          },
        ];
  const playlists = raw
    .filter(
      (p) => p && typeof p.id === 'string' && /^[\w-]{1,80}$/.test(p.id) && !seen.has(p.id) && seen.add(p.id),
    )
    .slice(0, MAX_PLAYLISTS)
    .map((p) => ({
      id: p.id,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 60) : '未命名播放列表',
      playlist: cleanVideos(p.playlist),
      subscriptions: normalizeSubscriptions(p.subscriptions),
      cloudSync: normalizeCloudSync(p.cloudSync),
    }));
  if (!playlists.length)
    playlists.push({
      id: 'default',
      name: '默认播放列表',
      playlist: [],
      subscriptions: [],
      cloudSync: normalizeCloudSync(),
    });
  let settings;
  try {
    settings = validateSettings(data.settings);
  } catch {
    settings = { ...defaults };
  }
  const library = {
    version: 2,
    settings,
    playlists,
    activePlaylistId: playlists.some((p) => p.id === data.activePlaylistId)
      ? data.activePlaylistId
      : playlists[0].id,
  };
  // Legacy field access resolves to the active list; JSON persists only the versioned list collection.
  for (const key of ['playlist', 'subscriptions', 'cloudSync'])
    Object.defineProperty(library, key, {
      get: () => activePlaylist(library)[key],
      set: (value) => {
        activePlaylist(library)[key] = value;
      },
    });
  return library;
}
function createPlaylist(library, name, copy = false) {
  name = playlistName(name);
  if (library.playlists.length >= MAX_PLAYLISTS) throw new Error('最多创建 20 个播放列表');
  if (library.playlists.some((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
    throw new Error('播放列表名称已存在');
  const item = {
    id: randomUUID(),
    name,
    playlist: copy ? structuredClone(library.playlist) : [],
    subscriptions: [],
    cloudSync: normalizeCloudSync(),
  };
  library.playlists.push(item);
  return item;
}
function renamePlaylist(library, id, name) {
  name = playlistName(name);
  const item = library.playlists.find((p) => p.id === id);
  if (!item) throw new Error('播放列表不存在');
  if (library.playlists.some((p) => p.id !== id && p.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
    throw new Error('播放列表名称已存在');
  item.name = name;
}
module.exports = { normalizeLibrary, activePlaylist, createPlaylist, renamePlaylist };
