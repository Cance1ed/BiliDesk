export interface Video {
  aid?: number;
  id: string;
  bvid: string;
  cid: number;
  page: number;
  title: string;
  cover: string;
  duration: number;
  owner: string;
  url: string;
}
export interface Settings {
  mode: 'sequence' | 'shuffle' | 'single';
  displayId: string;
  volume: number;
  fit: 'cover' | 'contain';
  portraitColumns: number;
  interval: number;
  quality: number;
  pauseOnBattery: boolean;
  launchAtLogin: boolean;
  autoPlayOnLaunch: boolean;
  pauseWhenDesktopHidden: boolean;
  showProgressBar: boolean;
}
export interface Stream {
  video: string;
  audio: string | null;
  quality: number;
}
export interface Profile {
  mid: number;
  name: string;
  avatar: string;
}
export interface Snapshot {
  activePlaylistId: string;
  playlists: { id: string; name: string; count: number }[];
  cloudSync: CloudSyncState;
  subscriptions: Subscription[];
  playlist: Video[];
  settings: Settings;
  profile: Profile | null;
  accountWarning: string;
  platform: string;
  displays: { id: string; label: string; width: number; height: number; primary: boolean }[];
  playback: { status: string; currentId: string | null; error: string; quality: number };
}
export interface Favorite {
  bvid: string;
  title: string;
  cover: string;
  duration: number;
  owner: string;
}
export interface Folder {
  id: number;
  title: string;
  count: number;
}
export interface Collection extends Folder {
  ownerMid: number;
  owner: string;
  cover: string;
}
export interface CloudSyncState {
  ownerMid: number;
  folderId: number;
  title: string;
  enabled: boolean;
  lastSyncAt: number;
  lastError: string;
  addedLast: number;
  syncing: boolean;
}
export interface AddResult {
  added: number;
  duplicates: number;
  errors: { input: string; message: string }[];
}
export interface Subscription {
  id: string;
  folderId: number;
  ownerMid: number;
  ownerName: string;
  title: string;
  intervalMinutes: number;
  enabled: boolean;
  syncing: boolean;
  lastSyncAt: number;
  lastAttemptAt: number;
  lastError: string;
  videoCount: number;
  addedLast: number;
}
export interface SubscriptionDiscovery {
  ownerMid: number;
  ownerName: string;
  folders: Folder[];
  selectedFolderId: number;
}
export interface Bridge {
  platform: string;
  bootstrap(): Promise<Snapshot>;
  createPlaylist(name: string, copy?: boolean): Promise<void>;
  activatePlaylist(id: string): Promise<void>;
  renamePlaylist(id: string, name: string): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  createFolder(value: { title: string; private: boolean }, playlistId: string): Promise<Folder>;
  add(text: string, playlistId?: string): Promise<AddResult>;
  remove(id: string, playlistId?: string): Promise<void>;
  removeMany(ids: string[], playlistId: string): Promise<void>;
  move(id: string, targetId: string, position: 'before' | 'after', playlistId: string): Promise<void>;
  reorder(id: string, direction: number, playlistId?: string): Promise<void>;
  settings(value: Settings): Promise<Snapshot>;
  qr(): Promise<{ url: string; qrcode_key: string }>;
  poll(key: string): Promise<{ code: number }>;
  logout(): Promise<void>;
  folders(): Promise<Folder[]>;
  collections(page: number): Promise<{ hasMore: boolean; collections: Collection[] }>;
  collectionVideos(
    id: number,
    ownerMid: number,
    page: number,
  ): Promise<{ title: string; hasMore: boolean; videos: Favorite[] }>;
  configureCloudSync(value: { folderId: number; enabled: boolean }, playlistId?: string): Promise<void>;
  disableCloudSync(playlistId?: string): Promise<void>;
  syncCloud(playlistId?: string): Promise<void>;
  discoverSubscriptions(input: string): Promise<SubscriptionDiscovery>;
  subscribe(value: { ownerMid: number; folderId: number; intervalMinutes: number }): Promise<string>;
  updateSubscription(id: string, value: { enabled: boolean; intervalMinutes: number }): Promise<void>;
  unsubscribe(id: string): Promise<void>;
  syncSubscription(id: string): Promise<void>;
  favorites(id: number, page: number): Promise<{ hasMore: boolean; videos: Favorite[] }>;
  preview(id: string): Promise<Stream>;
  releasePreview(): Promise<void>;
  start(id?: string): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  openVideo(id: string): Promise<void>;
  onState(callback: (state: Snapshot) => void): () => void;
}
export type WallpaperCommand = {
  type: 'load' | 'pause' | 'resume' | 'settings';
  generation?: number;
  paused?: boolean;
  stream?: Stream;
  settings?: Settings;
};
declare global {
  interface Window {
    bilidesk?: Bridge;
    wallpaper?: {
      ready(): Promise<WallpaperCommand | null>;
      report(type: string, generation: number): void;
      onCommand(callback: (command: WallpaperCommand) => void): () => void;
    };
  }
}
