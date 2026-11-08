const { contextBridge, ipcRenderer } = require('electron');
const invoke = (name, ...args) => ipcRenderer.invoke(`bili:${name}`, ...args);
const subscribe = (channel, callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('bilidesk', {
  platform: process.platform,
  bootstrap: () => invoke('bootstrap'),
  add: (text) => invoke('add', text),
  remove: (id) => invoke('remove', id),
  reorder: (id, direction) => invoke('reorder', id, direction),
  settings: (value) => invoke('settings', value),
  qr: () => invoke('qr'),
  poll: (key) => invoke('poll', key),
  logout: () => invoke('logout'),
  folders: () => invoke('folders'),
  collections: (page) => invoke('collections', page),
  collectionVideos: (id, ownerMid, page) => invoke('collection-videos', id, ownerMid, page),
  configureCloudSync: (value) => invoke('cloud-configure', value),
  disableCloudSync: () => invoke('cloud-disable'),
  syncCloud: () => invoke('cloud-sync'),
  discoverSubscriptions: (input) => invoke('subscription-discover', input),
  subscribe: (value) => invoke('subscription-add', value),
  updateSubscription: (id, value) => invoke('subscription-update', id, value),
  unsubscribe: (id) => invoke('subscription-remove', id),
  syncSubscription: (id) => invoke('subscription-sync', id),
  favorites: (id, page) => invoke('favorites', id, page),
  preview: (id) => invoke('preview', id),
  releasePreview: () => invoke('release-preview'),
  start: (id) => invoke('start', id),
  stop: () => invoke('stop'),
  pause: () => invoke('pause'),
  next: () => invoke('next'),
  openVideo: (id) => invoke('open-video', id),
  onState: (callback) => subscribe('bili:state', callback),
});
