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
  },
  profile: { mid: 123, name: '交互测试账号', avatar: '' },
  accountWarning: '',
  platform: 'web',
  displays: [],
  playback: { status: 'stopped', currentId: null, error: '', quality: 0 },
};
let listener: (s: Snapshot) => void = () => {};
const emit = () => listener(structuredClone(state));
const log = (text: string) => {
  document.querySelector('#qa-log')!.textContent = `交互测试数据，不连接账号 · ${text}`;
};
const unavailable = async (): Promise<never> => {
  throw new Error('此测试不连接真实账号');
};
window.bilidesk = {
  platform: 'web',
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
  folders: async () => [{ id: 999, title: 'BiliDesk 壁纸', count: 0 }],
  configureCloudSync: async (value) => {
    state.cloudSync = {
      ...state.cloudSync,
      ownerMid: 123,
      folderId: value.folderId,
      title: 'BiliDesk 壁纸',
      enabled: value.enabled,
    };
    emit();
  },
  syncCloud: async () => {
    state.cloudSync = { ...state.cloudSync, lastSyncAt: Date.now(), addedLast: state.playlist.length };
    emit();
    log(`模拟收藏 ${state.playlist.length} 个 · 自动同步 ${state.cloudSync.enabled}`);
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
