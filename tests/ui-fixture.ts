// Explicit development-only fixture. Not referenced by the production entry or shipped in packages.
import type { Bridge, Snapshot, Video } from '../src/types';
const ids = ['BV17x411w7KC', 'BV1xx411c7mD', 'BV1GJ411x7h7'];
const videos: Video[] = ids.map((bvid, i) => ({
  id: `${bvid}:${i + 1}`,
  bvid,
  aid: i + 1,
  cid: i + 1,
  page: 1,
  title: ['清晨的阿尔卑斯山', '森林与溪流', '海岸日落'][i],
  cover: '/alpine.png',
  duration: 120 + i * 60,
  owner: '交互测试 UP 主',
  url: '',
}));
const state: Snapshot = {
  activePlaylistId: 'default',
  playlists: [{ id: 'default', name: '默认播放列表', count: 0 }],
  playlist: [],
  subscriptions: [],
  cloudSync: {
    ownerMid: 0,
    folderId: 0,
    title: '',
    enabled: false,
    lastSyncAt: 0,
    lastError: '',
    addedLast: 0,
    syncing: false,
  },
  settings: {
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
    pauseWhenDesktopHidden: true,
    showProgressBar: false,
  },
  profile: { mid: 123, name: '交互测试账号', avatar: '' },
  accountWarning: '',
  platform: 'web',
  displays: [],
  playback: { status: 'stopped', currentId: null, error: '', quality: 0 },
};
let listener: (s: Snapshot) => void = () => {};
const lists = new Map<string, { playlist: Video[]; cloudSync: Snapshot['cloudSync'] }>([
  ['default', { playlist: state.playlist, cloudSync: state.cloudSync }],
]);
const emptyCloud = structuredClone(state.cloudSync);
const folders = [{ id: 999, title: '珍藏 · 保留原有内容', count: 12 }];
const emit = () => {
  lists.set(state.activePlaylistId, { playlist: state.playlist, cloudSync: state.cloudSync });
  state.playlists = state.playlists.map((p) => ({ ...p, count: lists.get(p.id)!.playlist.length }));
  listener(structuredClone(state));
};
const activate = async (id: string) => {
  const next = lists.get(id);
  if (!next) throw new Error('播放列表不存在');
  state.activePlaylistId = id;
  state.playlist = next.playlist;
  state.cloudSync = next.cloudSync;
  emit();
};
const log = (text: string) => {
  document.querySelector('#qa-log')!.textContent = `交互测试数据，不连接账号 · ${text}`;
};
const unavailable = async (): Promise<never> => {
  throw new Error('此测试不连接真实账号');
};
window.bilidesk = {
  platform: 'web',
  createPlaylist: async (name, copy = false) => {
    if (state.playlists.some((p) => p.name === name.trim())) throw new Error('播放列表名称已存在');
    const id = crypto.randomUUID();
    lists.set(id, {
      playlist: copy ? structuredClone(state.playlist) : [],
      cloudSync: structuredClone(emptyCloud),
    });
    state.playlists.push({ id, name: name.trim(), count: 0 });
    await activate(id);
  },
  activatePlaylist: activate,
  renamePlaylist: async (id, name) => {
    const p = state.playlists.find((p) => p.id === id)!;
    p.name = name;
    emit();
  },
  deletePlaylist: async (id) => {
    state.playlists = state.playlists.filter((p) => p.id !== id);
    lists.delete(id);
    await activate(state.playlists[0].id);
  },
  createFolder: async (value) => {
    if (folders.some((f) => f.title === value.title.trim()))
      throw new Error('同名收藏夹已存在，请修改名称或选择已有收藏夹追加保存');
    const f = { id: 1000 + folders.length, title: value.title, count: 0 };
    folders.push(f);
    log(`模拟新建「${f.title}」 · 私密 ${value.private} · 原有收藏夹仍有 ${folders[0].count} 个内容`);
    return f;
  },
  bootstrap: async () => structuredClone(state),
  onState: (cb) => {
    listener = cb;
    return () => {
      listener = () => {};
    };
  },
  collections: async () => ({
    hasMore: false,
    collections: [
      {
        id: 456,
        ownerMid: 789,
        title: '自然风景 · 壁纸收藏',
        owner: '交互测试 UP 主',
        count: 3,
        cover: '/alpine.png',
      },
    ],
  }),
  collectionVideos: async (_id, _mid, page) => ({
    title: '自然风景 · 壁纸收藏',
    hasMore: page === 1,
    videos: page === 1 ? videos.slice(0, 2) : videos.slice(2),
  }),
  add: async (text) => {
    const result = { added: 0, duplicates: 0, errors: [] };
    for (const bvid of text.split(/\s+/)) {
      const v = videos.find((v) => v.bvid === bvid);
      if (v) {
        if (state.playlist.some((p) => p.id === v.id)) result.duplicates++;
        else {
          state.playlist.push(v);
          result.added++;
        }
      }
    }
    emit();
    log(`播放列表 ${state.playlist.length} 个视频`);
    return result;
  },
  folders: async () => structuredClone(folders),
  configureCloudSync: async (value) => {
    state.cloudSync = {
      ...state.cloudSync,
      ownerMid: 123,
      folderId: value.folderId,
      title: folders.find((f) => f.id === value.folderId)!.title,
      enabled: value.enabled,
    };
    emit();
  },
  syncCloud: async () => {
    state.cloudSync = { ...state.cloudSync, lastSyncAt: Date.now(), addedLast: state.playlist.length };
    emit();
    log(
      `模拟收藏 ${state.playlist.length} 个 · 自动同步 ${state.cloudSync.enabled} · 原有收藏夹仍有 ${folders[0].count} 个内容`,
    );
  },
  disableCloudSync: async () => {
    state.cloudSync.enabled = false;
    emit();
    log('自动同步已关闭');
  },
  settings: async (value) => {
    state.settings = value;
    emit();
    return structuredClone(state);
  },
  remove: async (id) => {
    state.playlist = state.playlist.filter((v) => v.id !== id);
    emit();
  },
  removeMany: async (ids) => {
    state.playlist = state.playlist.filter((v) => !ids.includes(v.id));
    emit();
  },
  move: async (id, targetId, position) => {
    const video = state.playlist.find((v) => v.id === id)!;
    state.playlist = state.playlist.filter((v) => v.id !== id);
    const index = state.playlist.findIndex((v) => v.id === targetId);
    state.playlist.splice(index + (position === 'after' ? 1 : 0), 0, video);
    emit();
  },
  releasePreview: async () => {},
  qr: unavailable,
  poll: unavailable,
  logout: unavailable,
  discoverSubscriptions: unavailable,
  subscribe: unavailable,
  updateSubscription: unavailable,
  unsubscribe: unavailable,
  syncSubscription: unavailable,
  favorites: unavailable,
  preview: unavailable,
  start: unavailable,
  stop: unavailable,
  pause: unavailable,
  next: unavailable,
  openVideo: unavailable,
  reorder: unavailable,
} satisfies Bridge;
await import('../src/main');
