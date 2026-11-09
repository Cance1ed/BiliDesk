const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  protocol,
  screen,
  Tray,
  Menu,
  nativeImage,
  safeStorage,
  powerMonitor,
  shell,
} = require('electron');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { BilibiliClient, UA } = require('./bilibili.cjs');
const { Store } = require('./store.cjs');
const { defaults, validateSettings, nextIndex, isMediaUrl } = require('./core.cjs');
const { attachDesktop, inspectDesktopBounds } = require('./desktop.cjs');
const { SubscriptionManager } = require('./subscriptions.cjs');
const { CloudSync, normalizeCloudSync } = require('./cloud-sync.cjs');
const { normalizeLibrary, activePlaylist, createPlaylist, renamePlaylist } = require('./library.cjs');
const { createFavoriteFolder } = require('./favorite-folder.cjs');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'bilimedia',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
const devUrl = !app.isPackaged && process.env.BILIDESK_DEV_URL;
const smoke = process.argv.includes('--smoke-test');
app.setPath('userData', path.join(app.getPath('appData'), 'BiliDesk'));
if (smoke) app.setPath('userData', path.join(app.getPath('temp'), `bilidesk-smoke-${process.pid}`));
let mainWindow, wallpaperWindow, tray, store, bili, authSession, mediaSession, subscriptions, cloudSync;
let library = normalizeLibrary();
let profile = null,
  accountWarning = '',
  qrKey = '',
  qrTime = 0,
  lastPoll = 0,
  pollInFlight = false;
let playback = { status: 'stopped', currentId: null, error: '', quality: 0 };
let generation = 0,
  activeCommand = null,
  intervalTimer,
  healthTimer,
  loadingTimer,
  validDesktop;
let closing = false,
  failures = new Set(),
  systemPaused = false;
const mediaTokens = new Map();
const systemBlocks = new Set();
const mediaRequests = new Map();
const root = path.join(__dirname, '..');
const snapshot = () => ({
  playlist: library.playlist,
  settings: library.settings,
  activePlaylistId: library.activePlaylistId,
  playlists: library.playlists.map((p) => ({ id: p.id, name: p.name, count: p.playlist.length })),
  subscriptions: subscriptions ? subscriptions.snapshot() : [],
  cloudSync: cloudSync ? cloudSync.snapshot() : { ...library.cloudSync, syncing: false },
  profile,
  accountWarning,
  playback,
  platform: process.platform,
  displays: screen.getAllDisplays().map((d) => ({
    id: String(d.id),
    label: d.label || `显示器 ${d.id}`,
    width: d.size.width,
    height: d.size.height,
    primary: d.id === screen.getPrimaryDisplay().id,
  })),
});
const emit = () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('bili:state', snapshot());
  updateTray();
};
const save = async () => {
  await store.save(library);
  cloudSync?.schedule();
};
function token(url, group) {
  const key = randomBytes(24).toString('hex');
  mediaTokens.set(key, { url, group });
  return `bilimedia://stream/${key}`;
}
function clearTokens(group) {
  mediaRequests.set(group, (mediaRequests.get(group) || 0) + 1);
  for (const [key, entry] of mediaTokens) if (entry.group === group) mediaTokens.delete(key);
}
async function getStream(video, group) {
  const request = (mediaRequests.get(group) || 0) + 1;
  mediaRequests.set(group, request);
  const stream = await bili.stream(video, library.settings.quality);
  if (mediaRequests.get(group) !== request) throw new Error('播放请求已取消');
  clearTokens(group);
  return {
    video: token(stream.videoUrl, group),
    audio: stream.audioUrl ? token(stream.audioUrl, group) : null,
    quality: stream.quality,
  };
}
function sendCommand(command) {
  if (wallpaperWindow && !wallpaperWindow.isDestroyed())
    wallpaperWindow.webContents.send('wallpaper:command', command);
}
function loadWindow(win, wallpaper = false) {
  if (devUrl) return win.loadURL(devUrl + (wallpaper ? '/?wallpaper=1' : '/'));
  return win.loadFile(path.join(root, 'dist', 'index.html'), wallpaper ? { query: { wallpaper: '1' } } : {});
}
function lockWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
}
async function createMain() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 940,
    minWidth: 940,
    minHeight: 700,
    show: false,
    backgroundColor: '#ffffff',
    title: 'BiliDesk',
    icon: path.join(root, 'dist', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  lockWindow(mainWindow);
  mainWindow.on('close', (event) => {
    if (!closing && tray && !smoke) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  await loadWindow(mainWindow);
  if (!smoke) mainWindow.show();
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 BiliDesk', click: () => mainWindow.show() },
      { type: 'separator' },
      {
        label: playback.status === 'paused' ? '继续播放' : '暂停壁纸',
        enabled: ['playing', 'paused'].includes(playback.status),
        click: () => togglePause(),
      },
      { label: '下一视频', enabled: !!wallpaperWindow, click: () => advance().catch(handleFailure) },
      { label: '停止壁纸', enabled: !!wallpaperWindow, click: () => stop() },
      { type: 'separator' },
      { label: '退出 BiliDesk', click: () => app.quit() },
    ]),
  );
}
function createTray() {
  // Reuse the application artwork, including its pink background and white play symbol.
  const size = process.platform === 'darwin' ? 22 : 24;
  const icon = nativeImage.createFromPath(path.join(root, 'dist', 'icon.png')).resize({
    width: size,
    height: size,
    quality: 'best',
  });
  tray = new Tray(icon);
  tray.setToolTip('BiliDesk · 动态壁纸');
  tray.on('double-click', () => mainWindow.show());
  updateTray();
}
async function createWallpaper() {
  const display =
    screen.getAllDisplays().find((d) => String(d.id) === library.settings.displayId) ||
    screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    ...display.bounds,
    show: false,
    frame: false,
    thickFrame: false,
    transparent: false,
    backgroundColor: '#101318',
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    roundedCorners: false,
    ...(process.platform === 'darwin' ? { type: 'desktop', hiddenInMissionControl: true } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'wallpaper-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  wallpaperWindow = win;
  lockWindow(win);
  win.setIgnoreMouseEvents(true);
  win.on('closed', () => {
    if (wallpaperWindow === win) wallpaperWindow = null;
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    if (smoke) console.error('SMOKE_RENDERER_EXIT', details);
    if (wallpaperWindow === win) stop('壁纸播放器意外退出，请重新启用');
  });
  try {
    await loadWindow(win, true);
    if (wallpaperWindow !== win || win.isDestroyed()) throw new Error('壁纸启动已取消');
    const bounds =
      process.platform === 'win32' ? screen.dipToScreenRect(null, display.bounds) : display.bounds;
    validDesktop = attachDesktop(win, bounds);
    win.showInactive();
    healthTimer = setInterval(() => {
      if (!validDesktop?.()) stop('桌面进程已重启，请重新启用动态壁纸');
    }, 5000);
  } catch (error) {
    if (!win.isDestroyed()) win.destroy();
    throw error;
  }
}
function scheduleAdvance() {
  clearTimeout(intervalTimer);
  if (playback.status === 'playing' && library.settings.interval > 0)
    intervalTimer = setTimeout(() => advance().catch(handleFailure), library.settings.interval * 1000);
}
function stop(error = '') {
  generation++;
  clearTimeout(intervalTimer);
  clearTimeout(loadingTimer);
  clearInterval(healthTimer);
  activeCommand = null;
  systemPaused = false;
  if (wallpaperWindow && !wallpaperWindow.isDestroyed()) wallpaperWindow.destroy();
  wallpaperWindow = null;
  clearTokens('wallpaper');
  playback = { ...playback, status: error ? 'error' : 'stopped', error };
  emit();
}
async function start(id, auto = false) {
  const video = library.playlist.find((v) => v.id === id) || (!id ? library.playlist[0] : null);
  if (!video) throw new Error('请先添加并选择一个视频');
  if (!auto) failures.clear();
  const run = ++generation;
  clearTimeout(intervalTimer);
  clearTimeout(loadingTimer);
  sendCommand({ type: 'pause' });
  playback = { status: 'loading', currentId: video.id, error: '', quality: 0 };
  emit();
  try {
    const stream = await getStream(video, 'wallpaper');
    if (generation !== run) return;
    if (!wallpaperWindow) await createWallpaper();
    if (generation !== run) return;
    activeCommand = { type: 'load', generation: run, stream, settings: library.settings };
    playback.quality = stream.quality;
    sendCommand(activeCommand);
    loadingTimer = setTimeout(() => {
      if (generation === run) handleFailure(new Error('视频加载超时，请检查网络后重试'));
    }, 30000);
  } catch (error) {
    if (generation === run) {
      if (auto) await handleFailure(error);
      else {
        stop(error.message);
        throw error;
      }
    }
  }
}
async function advance() {
  const index = library.playlist.findIndex((v) => v.id === playback.currentId);
  const next = nextIndex(library.playlist.length, index, library.settings.mode);
  if (next < 0) return stop();
  await start(library.playlist[next].id, true);
}
async function handleFailure(error) {
  clearTimeout(loadingTimer);
  failures.add(playback.currentId);
  const available = library.playlist.filter((v) => !failures.has(v.id));
  if (!available.length || library.settings.mode === 'single')
    return stop(error.message || '视频无法播放，请重新解析或登录后重试');
  playback.error = `${error.message || '当前视频无法播放'}；已跳过`;
  emit();
  await start(available[0].id, true);
}
function togglePause() {
  if (!wallpaperWindow || !['playing', 'paused'].includes(playback.status)) return;
  const resume = playback.status === 'paused';
  systemPaused = false;
  sendCommand({ type: resume ? 'resume' : 'pause' });
  playback.status = resume ? 'loading' : 'paused';
  clearTimeout(intervalTimer);
  emit();
}
function pauseForSystem() {
  if (!['playing', 'loading'].includes(playback.status)) return;
  systemPaused = true;
  clearTimeout(intervalTimer);
  clearTimeout(loadingTimer);
  sendCommand({ type: 'pause' });
  playback.status = 'paused';
  emit();
}
function resumeForSystem() {
  if (
    systemPaused &&
    systemBlocks.size === 0 &&
    !(library.settings.pauseOnBattery && powerMonitor.isOnBatteryPower())
  ) {
    systemPaused = false;
    if (wallpaperWindow) start(playback.currentId).catch(() => {});
  }
}
function assertMain(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame)
    throw new Error('拒绝未知来源');
}
function handle(name, fn) {
  ipcMain.handle(`bili:${name}`, async (event, ...args) => {
    assertMain(event);
    return fn(...args);
  });
}
async function initialize() {
  store = new Store(app.getPath('userData'));
  library = await store.load();
  authSession = session.fromPartition('bilidesk-auth');
  mediaSession = session.fromPartition('bilidesk-media');
  for (const s of [session.defaultSession, authSession, mediaSession]) {
    s.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    s.setPermissionCheckHandler(() => false);
  }
  await store.restoreAuth(authSession, safeStorage);
  bili = new BilibiliClient((url, options) => authSession.fetch(url, options));
  protocol.handle('bilimedia', async (request) => {
    const key = new URL(request.url).pathname.slice(1);
    const entry = mediaTokens.get(key);
    if (!entry) return new Response('Expired media', { status: 410 });
    try {
      let url = entry.url;
      for (let i = 0; i < 4; i++) {
        if (!isMediaUrl(url)) return new Response('Invalid media host', { status: 403 });
        const headers = { Referer: 'https://www.bilibili.com/', 'User-Agent': UA };
        const range = request.headers.get('range');
        if (range) headers.Range = range;
        const response = await mediaSession.fetch(url, {
          headers,
          redirect: 'manual',
          signal: request.signal,
        });
        if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
          url = new URL(response.headers.get('location'), url).href;
          await response.body?.cancel();
          continue;
        }
        const outputHeaders = new Headers();
        for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges'])
          if (response.headers.has(h)) outputHeaders.set(h, response.headers.get(h));
        outputHeaders.set('Access-Control-Allow-Origin', '*');
        return new Response(response.body, { status: response.status, headers: outputHeaders });
      }
      return new Response('Too many redirects', { status: 502 });
    } catch {
      return new Response('Media unavailable', { status: 502 });
    }
  });
  handle('bootstrap', () => snapshot());
  const bindPlaylist = () => {
    subscriptions?.close();
    cloudSync?.close();
    const context = activePlaylist(library);
    subscriptions = new SubscriptionManager({ client: bili, getLibrary: () => context, save, changed: emit });
    cloudSync = new CloudSync({
      client: bili,
      getLibrary: () => context,
      getAccount: () => profile?.mid,
      save,
      changed: emit,
      writeFavorite: async (aid, folderId, account, valid) => {
        const cookies = await authSession.cookies.get({ url: 'https://api.bilibili.com', name: 'bili_jct' });
        if (!valid() || profile?.mid !== account) throw new Error('账号已切换，同步已停止');
        const csrf = cookies[0]?.value;
        if (!csrf) throw new Error('登录校验已失效，请重新扫码登录');
        return bili.addFavorite(aid, folderId, csrf);
      },
    });
    if (!smoke) {
      subscriptions.start();
      cloudSync.start();
    }
  };
  bindPlaylist();
  const assertPlaylist = (id) => {
    if (id !== undefined && id !== library.activePlaylistId) throw new Error('播放列表已切换，请重新操作');
  };
  handle('subscription-discover', (input) => subscriptions.discover(input));
  handle('subscription-add', (value) => subscriptions.add(value));
  handle('subscription-update', (id, value) => subscriptions.update(id, value));
  handle('subscription-remove', (id) => subscriptions.remove(id));
  handle('subscription-sync', (id) => subscriptions.sync(id));
  let adding = false;
  let changingPlaylist = false;
  const changePlaylist = async (action) => {
    if (adding || changingPlaylist) throw new Error('正在保存或导入，请稍后切换播放列表');
    changingPlaylist = true;
    const previous = normalizeLibrary(JSON.parse(JSON.stringify(library)));
    try {
      action();
      stop();
      clearTokens('preview');
      bindPlaylist();
      await save();
      emit();
    } catch (error) {
      library = previous;
      bindPlaylist();
      emit();
      throw error;
    } finally {
      changingPlaylist = false;
    }
  };
  handle('playlist-create', (name, copy = false) =>
    changePlaylist(() => {
      const item = createPlaylist(library, name, copy === true);
      library.activePlaylistId = item.id;
    }),
  );
  handle('playlist-activate', (id) =>
    changePlaylist(() => {
      if (!library.playlists.some((p) => p.id === id)) throw new Error('播放列表不存在');
      library.activePlaylistId = id;
    }),
  );
  handle('playlist-rename', async (id, name) => {
    renamePlaylist(library, id, name);
    await save();
    emit();
  });
  handle('playlist-delete', (id) =>
    changePlaylist(() => {
      if (library.playlists.length <= 1) throw new Error('至少保留一个播放列表');
      if (!library.playlists.some((p) => p.id === id)) throw new Error('播放列表不存在');
      library.playlists = library.playlists.filter((p) => p.id !== id);
      if (library.activePlaylistId === id) library.activePlaylistId = library.playlists[0].id;
    }),
  );
  handle('add', async (text, playlistId) => {
    assertPlaylist(playlistId);
    if (adding || changingPlaylist) throw new Error('正在保存或解析上一批视频，请稍等');
    if (typeof text !== 'string' || text.length > 30000) throw new Error('输入过长，请分批添加');
    const inputs = text.split(/[\s,，;；]+/).filter(Boolean);
    if (!inputs.length || inputs.length > 100) throw new Error('每次请输入 1–100 个视频链接');
    if (library.playlist.length + inputs.length > 1000) throw new Error('播放列表最多支持 1000 个视频');
    adding = true;
    const errors = [];
    let added = 0,
      duplicates = 0;
    try {
      for (const input of inputs) {
        try {
          const video = await bili.resolve(input);
          if (!library.playlist.some((v) => v.id === video.id)) {
            if (library.playlist.length >= 1000) throw new Error('播放列表最多支持 1000 个视频');
            library.playlist.push(video);
            added++;
          } else duplicates++;
        } catch (error) {
          errors.push({ input, message: error.message });
        }
      }
      await save();
      emit();
      return { added, duplicates, errors };
    } finally {
      adding = false;
    }
  });
  handle('remove', async (id) => {
    if (playback.currentId === id) stop();
    library.playlist = library.playlist.filter((v) => v.id !== id);
    await save();
    emit();
  });
  handle('reorder', async (id, direction) => {
    if (direction !== -1 && direction !== 1) throw new Error('无效排序');
    const index = library.playlist.findIndex((v) => v.id === id),
      target = index + direction;
    if (index >= 0 && target >= 0 && target < library.playlist.length)
      [library.playlist[index], library.playlist[target]] = [
        library.playlist[target],
        library.playlist[index],
      ];
    await save();
    emit();
  });
  handle('settings', async (settings) => {
    const previous = library.settings;
    const next = validateSettings(settings);
    if (next.launchAtLogin !== previous.launchAtLogin) {
      if (!app.isPackaged) throw new Error('请安装打包后的应用，再设置开机启动');
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, args: ['--hidden'] });
    }
    library.settings = next;
    await save();
    if (wallpaperWindow && (previous.displayId !== next.displayId || previous.quality !== next.quality)) {
      const id = playback.currentId;
      stop();
      await start(id);
    } else {
      sendCommand({ type: 'settings', settings: next });
      scheduleAdvance();
    }
    if (next.pauseOnBattery && powerMonitor.isOnBatteryPower()) pauseForSystem();
    else if (!next.pauseOnBattery) resumeForSystem();
    emit();
    return snapshot();
  });
  handle('qr', async () => {
    const data = await bili.qr();
    qrKey = data.qrcode_key;
    qrTime = Date.now();
    return data;
  });
  handle('poll', async (key) => {
    if (typeof key !== 'string' || key !== qrKey || Date.now() - qrTime > 180000) return { code: 86038 };
    if (pollInFlight || Date.now() - lastPoll < 1800) return { code: 86101 };
    pollInFlight = true;
    lastPoll = Date.now();
    try {
      const data = await bili.poll(key);
      if (data.code === 0) {
        profile = await bili.profile();
        if (!profile) throw new Error('扫码已确认，但登录状态未建立，请重新扫码');
        accountWarning = '';
        try {
          await store.saveAuth(await authSession.cookies.get({ domain: 'bilibili.com' }), safeStorage);
        } catch (error) {
          accountWarning = error.message;
        }
        qrKey = '';
        emit();
      }
      return { code: data.code };
    } finally {
      pollInFlight = false;
    }
  });
  handle('logout', async () => {
    await cloudSync.disable();
    for (const list of library.playlists) list.cloudSync.enabled = false;
    await save();
    stop();
    qrKey = '';
    await authSession.clearStorageData();
    await store.clearAuth();
    clearTokens('preview');
    profile = null;
    bili.wbi = null;
    accountWarning = '';
    emit();
  });
  handle('folders', async () => {
    profile = await bili.profile();
    emit();
    if (!profile) throw new Error('请先登录 Bilibili');
    return bili.folders(profile.mid);
  });
  const validPage = (value) => Number.isSafeInteger(value) && value >= 1 && value <= 1000;
  const validId = (value) => Number.isSafeInteger(value) && value > 0;
  handle('collections', async (page) => {
    if (!validPage(page)) throw new Error('无效页码');
    const user = await bili.profile();
    if (!user) throw new Error('请先登录 Bilibili');
    return bili.collections(user.mid, page);
  });
  handle('collection-videos', (id, ownerMid, page) => {
    if (!validId(id) || !validId(ownerMid) || !validPage(page)) throw new Error('无效合集参数');
    return bili.collectionVideos(id, ownerMid, page);
  });
  handle('cloud-configure', (value, playlistId) => {
    assertPlaylist(playlistId);
    return cloudSync.configure(value);
  });
  handle('cloud-disable', (playlistId) => {
    assertPlaylist(playlistId);
    return cloudSync.disable();
  });
  handle('cloud-sync', (playlistId) => {
    assertPlaylist(playlistId);
    return cloudSync.sync();
  });
  let creatingFolder = false;
  handle('folder-create', async (value, playlistId) => {
    assertPlaylist(playlistId);
    if (creatingFolder) throw new Error('正在新建收藏夹，请稍候');
    const context = activePlaylist(library),
      account = profile?.mid;
    const valid = () => profile?.mid === account && activePlaylist(library) === context;
    creatingFolder = true;
    try {
      return await createFavoriteFolder({
        client: bili,
        value,
        account,
        valid,
        getCsrf: async () => {
          const cookies = await authSession.cookies.get({
            url: 'https://api.bilibili.com',
            name: 'bili_jct',
          });
          return cookies[0]?.value;
        },
      });
    } finally {
      creatingFolder = false;
    }
  });
  handle('favorites', async (id, page) => {
    if (!profile) throw new Error('请先登录');
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(page) || page < 1 || page > 1000)
      throw new Error('无效收藏夹页码');
    return bili.favorites(id, page);
  });
  handle('preview', async (id) => {
    const video = library.playlist.find((v) => v.id === id);
    if (!video) throw new Error('视频不在播放列表中');
    return getStream(video, 'preview');
  });
  handle('release-preview', () => clearTokens('preview'));
  handle('start', (id) => start(id));
  handle('stop', () => stop());
  handle('pause', () => togglePause());
  handle('next', () => advance());
  handle('open-video', (id) => {
    const v = library.playlist.find((v) => v.id === id);
    if (v) return shell.openExternal(`https://www.bilibili.com/video/${v.bvid}/?p=${v.page}`);
  });
  ipcMain.handle('wallpaper:ready', (event) => {
    if (event.sender !== wallpaperWindow?.webContents) throw new Error('拒绝未知播放器');
    return activeCommand;
  });
  ipcMain.on('wallpaper:report', (event, data) => {
    if (event.sender !== wallpaperWindow?.webContents || data?.generation !== generation) return;
    if (data.type === 'playing') {
      clearTimeout(loadingTimer);
      playback.status = 'playing';
      playback.error = '';
      failures.clear();
      if (
        systemPaused ||
        systemBlocks.size > 0 ||
        (library.settings.pauseOnBattery && powerMonitor.isOnBatteryPower())
      )
        pauseForSystem();
      else {
        scheduleAdvance();
        emit();
      }
    } else if (data.type === 'ended') advance().catch(handleFailure);
    else if (data.type === 'error')
      handleFailure(new Error('视频播放失败，地址可能已过期或网络中断')).catch((error) =>
        stop(error.message),
      );
  });
  await createMain();
  if (!smoke) createTray();
  if (process.argv.includes('--hidden')) mainWindow.hide();
  if (!smoke)
    bili
      .profile()
      .then((user) => {
        profile = user;
        cloudSync.schedule();
        emit();
      })
      .catch((error) => {
        accountWarning = error.message;
        emit();
      });
  powerMonitor.on('lock-screen', () => {
    systemBlocks.add('lock');
    pauseForSystem();
  });
  powerMonitor.on('suspend', () => {
    systemBlocks.add('sleep');
    pauseForSystem();
  });
  powerMonitor.on('unlock-screen', () => {
    systemBlocks.delete('lock');
    resumeForSystem();
  });
  powerMonitor.on('resume', () => {
    systemBlocks.delete('sleep');
    resumeForSystem();
  });
  powerMonitor.on('on-battery', () => {
    if (library.settings.pauseOnBattery) pauseForSystem();
  });
  powerMonitor.on('on-ac', resumeForSystem);
  const displayChanged = () => {
    emit();
    if (wallpaperWindow) {
      const id = playback.currentId;
      stop();
      start(id).catch(() => {});
    }
  };
  screen.on('display-added', displayChanged);
  screen.on('display-removed', displayChanged);
  screen.on('display-metrics-changed', displayChanged);
  if (smoke) {
    try {
      const result = await mainWindow.webContents.executeJavaScript(
        `(async () => { const s = await window.bilidesk.bootstrap(); await new Promise((resolve, reject) => { let count = 0; const check = () => { if (document.querySelector('h1')) resolve(); else if (++count > 100) reject(new Error('UI did not render')); else setTimeout(check, 30); }; check(); }); return { platform: s.platform, count: s.playlist.length, title: document.querySelector('h1')?.textContent, isolated: typeof require === 'undefined' }; })()`,
      );
      console.log('BILIDESK_SMOKE ' + JSON.stringify(result));
      // Isolated smoke data only; exercise the real IPC and persistence without account writes.
      library.playlist.push({
        id: 'BV17x411w7KC:1',
        bvid: 'BV17x411w7KC',
        cid: 1,
        title: 'Playlist smoke fixture',
      });
      await save();
      const listCheck = await mainWindow.webContents.executeJavaScript(`(async()=>{
        const api=window.bilidesk,check=(value,message)=>{if(!value)throw new Error(message);};
        const original=await api.bootstrap();
        await api.createPlaylist('烟测副本',true);
        let s=await api.bootstrap();const copy=s.activePlaylistId;
        check(s.playlist.length===1&&!s.cloudSync.enabled&&!s.cloudSync.folderId,'Copy inherited unsafe config');
        await api.renamePlaylist(copy,'工作专注');
        await api.remove(s.playlist[0].id);
        await api.createPlaylist('空列表');
        s=await api.bootstrap();const empty=s.activePlaylistId;
        check(s.playlist.length===0&&s.playlists.length===3,'New list not empty');
        let stale=false;try{await api.add('av170001',copy);}catch{stale=true;}
        check(stale,'Stale import target accepted');
        await api.activatePlaylist(original.activePlaylistId);
        s=await api.bootstrap();check(s.playlist.length===1,'Original list was changed');
        await api.deletePlaylist(copy);await api.deletePlaylist(empty);
        let last=false;try{await api.deletePlaylist(original.activePlaylistId);}catch{last=true;}
        check(last,'Last playlist deleted');
        let guarded=false;try{await api.createFolder({title:'smoke',private:true},original.activePlaylistId);}catch{guarded=true;}
        check(guarded,'Anonymous folder write accepted');
        await api.remove(s.playlist[0].id);
        return{copyIsolated:true,renamed:true,switched:true,deletedLocally:true,staleImportBlocked:stale,anonymousCreateBlocked:guarded};
      })()`);
      const listDisk = await store.load();
      if (listDisk.playlists.length !== 1 || listDisk.playlist.length !== 0)
        throw new Error('Playlist IPC changes were not persisted');
      console.log('BILIDESK_PLAYLISTS ' + JSON.stringify({ ...listCheck, persisted: true }));
      if (process.argv.includes('--smoke-subscriptions')) {
        const collection = await mainWindow.webContents.executeJavaScript(
          `window.bilidesk.collectionVideos(1227671,37737161,1)`,
        );
        if (!collection.videos.length) throw new Error('Collection content IPC failed');
        const guarded = await mainWindow.webContents.executeJavaScript(
          `(async()=>{try{await window.bilidesk.configureCloudSync({folderId:456,enabled:true});return false;}catch{return true;}})()`,
        );
        if (!guarded || library.cloudSync.enabled) throw new Error('Anonymous cloud sync was not rejected');
        console.log(
          'BILIDESK_COLLECTIONS ' +
            JSON.stringify({ videos: collection.videos.length, anonymousCloudWriteBlocked: guarded }),
        );
        const discovery = await mainWindow.webContents.executeJavaScript(
          `window.bilidesk.discoverSubscriptions('https://space.bilibili.com/686127/favlist?fid=1052622027')`,
        );
        if (discovery.selectedFolderId !== 1052622027) throw new Error('Subscription discovery failed');
        const id = await mainWindow.webContents.executeJavaScript(
          `window.bilidesk.subscribe({ownerMid:686127,folderId:1052622027,intervalMinutes:60})`,
        );
        for (let i = 0; i < 300 && subscriptions.running.has(id); i++)
          await new Promise((resolve) => setTimeout(resolve, 200));
        const synced = subscriptions.snapshot()[0];
        if (!synced || synced.syncing || !synced.lastSyncAt || !library.playlist.length || synced.lastError)
          throw new Error(`Subscription sync failed: ${synced?.lastError || 'timeout or empty'}`);
        const count = library.playlist.length;
        await mainWindow.webContents.executeJavaScript(
          `window.bilidesk.updateSubscription('${id}',{enabled:false,intervalMinutes:15})`,
        );
        const persisted = (await store.load()).subscriptions[0];
        if (persisted.enabled || persisted.intervalMinutes !== 15 || !persisted.knownBvids.length)
          throw new Error('Subscription state not persisted');
        await mainWindow.webContents.executeJavaScript(`window.bilidesk.unsubscribe('${id}')`);
        if (library.subscriptions.length || library.playlist.length !== count)
          throw new Error('Unsubscribe changed playlist');
        await mainWindow.webContents.executeJavaScript(
          `(async()=>{const s=await window.bilidesk.bootstrap();for(const v of s.playlist)await window.bilidesk.remove(v.id);})()`,
        );
        console.log(
          'BILIDESK_SUBSCRIPTIONS ' +
            JSON.stringify({ discovered: true, imported: count, persisted: true, unsubscribed: true }),
        );
      }
      if (process.argv.includes('--smoke-playback')) {
        const added = await mainWindow.webContents.executeJavaScript(
          `window.bilidesk.add('av170001 av170001 https://invalid.example/video')`,
        );
        if (added.added !== 1 || added.duplicates !== 1 || added.errors.length !== 1)
          throw new Error('Batch add / duplicate / validation regression');
        console.log(
          'BILIDESK_IPC ' +
            JSON.stringify({
              added: added.added,
              duplicates: added.duplicates,
              rejected: added.errors.length,
            }),
        );
        await mainWindow.webContents.executeJavaScript(
          `(async () => { const s = await window.bilidesk.bootstrap(); await window.bilidesk.settings({ ...s.settings, pauseOnBattery: false }); await window.bilidesk.start(s.playlist[0].id); })()`,
        );
        let frames = null;
        for (let i = 0; i < 150; i++) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          if (playback.status === 'error') throw new Error(playback.error);
          if (wallpaperWindow && playback.status === 'playing') {
            frames = await wallpaperWindow.webContents.executeJavaScript(
              `(() => { const v = document.querySelector('video'); return v ? { time: v.currentTime, width: v.videoWidth, height: v.videoHeight, frames: v.getVideoPlaybackQuality().totalVideoFrames } : null; })()`,
            );
            if (frames?.time > 2 && frames.frames > 5) break;
          }
        }
        console.log(
          'BILIDESK_PLAYBACK ' +
            JSON.stringify({ status: playback.status, desktopAttached: validDesktop?.(), ...frames }),
        );
        if (!frames || frames.time <= 2 || frames.frames <= 5)
          throw new Error('No advancing decoded video frames');
        if (process.platform === 'win32') {
          const actual = inspectDesktopBounds(wallpaperWindow);
          const expected = screen.dipToScreenRect(null, screen.getPrimaryDisplay().bounds);
          console.log('BILIDESK_COVERAGE ' + JSON.stringify({ expected, actual }));
          if (
            actual.client.x !== expected.x ||
            actual.client.y !== expected.y ||
            actual.client.width !== expected.width ||
            actual.client.height !== expected.height
          )
            throw new Error('Wallpaper client area does not cover the display');
        }
        if (process.platform === 'darwin') {
          const layer = inspectDesktopBounds(wallpaperWindow);
          console.log('BILIDESK_LAYER ' + JSON.stringify(layer));
          if (!(layer.level > layer.desktopLevel && layer.level < layer.iconLevel))
            throw new Error('Wallpaper window is not between the desktop and its icons');
        }
        await mainWindow.webContents.executeJavaScript(`window.bilidesk.pause()`);
        await new Promise((resolve) => setTimeout(resolve, 300));
        const paused = await wallpaperWindow.webContents.executeJavaScript(
          `document.querySelector('video').paused`,
        );
        if (!paused) throw new Error('Pause did not reach the video element');
        await mainWindow.webContents.executeJavaScript(
          `(async () => { const s = await window.bilidesk.bootstrap(); await window.bilidesk.stop(); await window.bilidesk.remove(s.playlist[0].id); })()`,
        );
        if ((await store.load()).playlist.length !== 0) throw new Error('Playlist removal was not persisted');
      }
      if (process.argv.includes('--smoke-portrait')) {
        // Synthetic playback has no library item to re-open on transient desktop work-area events.
        for (const event of ['display-added', 'display-removed', 'display-metrics-changed'])
          screen.removeListener(event, displayChanged);
        await createWallpaper();
        await require(path.join(process.cwd(), 'scripts', 'portrait-smoke.cjs'))({
          window: wallpaperWindow,
          send: sendCommand,
          settings: library.settings,
          generation: generation + 1000,
        });
        stop();
      }
      app.exit(result.title === '我的壁纸' && result.isolated ? 0 : 1);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  }
}
if (!app.requestSingleInstanceLock() && !smoke) app.quit();
else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  app
    .whenReady()
    .then(initialize)
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
}
app.on('activate', () => mainWindow?.show());
app.on('window-all-closed', () => {
  if (!tray) app.quit();
});
app.on('before-quit', () => {
  cloudSync?.close();
  closing = true;
  subscriptions?.close();
  clearTimeout(intervalTimer);
  clearTimeout(loadingTimer);
  clearInterval(healthTimer);
  wallpaperWindow?.destroy();
});
