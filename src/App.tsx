import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Monitor,
  Image as ImageIcon,
  Star,
  SlidersHorizontal,
  Plus,
  UserRound,
  ChevronRight,
  Link2,
  ListVideo,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
  SkipForward,
  Info,
  X,
  LoaderCircle,
  Check,
  Search,
  FolderOpen,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Battery,
  Maximize,
  Clock3,
  Film,
  Layers,
} from 'lucide-react';
import { api, duration, qualityName } from './api';
import { version } from '../package.json';
import type { Snapshot, Settings, Stream, Folder, Favorite, AddResult } from './types';
import { Modal } from './Modal';
import { Login } from './Login';
import { MediaPlayer } from './MediaPlayer';
import { Subscriptions } from './Subscriptions';
import { Collections } from './Collections';
import { CloudSyncPanel } from './CloudSyncPanel';
import { PlaylistManager } from './PlaylistManager';
import { PlaylistVideos } from './PlaylistVideos';

const modes = { sequence: '顺序轮播', shuffle: '随机播放', single: '单曲循环' };
const statusLabels: Record<string, string> = {
  stopped: '尚未启用',
  loading: '正在加载',
  playing: '正在播放',
  paused: '已暂停',
  error: '播放失败',
};
export default function App() {
  const [state, setState] = useState<Snapshot | null>(null),
    [tab, setTab] = useState('wallpapers');
  const [favoriteView, setFavoriteView] = useState('subscriptions');
  const [modal, setModal] = useState<'add' | 'login' | null>(null),
    [busy, setBusy] = useState(''),
    [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [links, setLinks] = useState(''),
    [batch, setBatch] = useState(''),
    [result, setResult] = useState<AddResult | null>(null);
  const [selectedId, setSelectedId] = useState(''),
    [preview, setPreview] = useState<Stream | null>(null),
    [query, setQuery] = useState('');
  const [folders, setFolders] = useState<Folder[]>([]),
    [folderId, setFolderId] = useState(0),
    [favorites, setFavorites] = useState<Favorite[]>([]),
    [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(false),
    [chosen, setChosen] = useState<Set<string>>(new Set());
  const [volume, setVolume] = useState(0);
  const [importProgress, setImportProgress] = useState('');
  const cancelImport = useRef(false);
  const input = useRef<HTMLInputElement>(null),
    previewRun = useRef(0);
  const closeModal = useCallback(() => setModal(null), []);
  const loginSuccess = useCallback(() => {
    setModal(null);
    setNotice({ text: '已登录 Bilibili，可以导入收藏夹了' });
  }, []);
  useEffect(() => {
    api
      .bootstrap()
      .then(setState)
      .catch((e) => setNotice({ text: e.message, error: true }));
    return api.onState(setState);
  }, []);
  useEffect(() => {
    if (state) setVolume(state.settings.volume);
  }, [state?.settings.volume]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const stopHiddenPreview = () => {
      if (document.hidden) {
        previewRun.current++;
        setPreview(null);
        void api.releasePreview();
      }
    };
    document.addEventListener('visibilitychange', stopHiddenPreview);
    return () => document.removeEventListener('visibilitychange', stopHiddenPreview);
  }, []);
  const task = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    try {
      await fn();
    } catch (error) {
      setNotice({
        text: (error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
        error: true,
      });
    } finally {
      setBusy('');
    }
  };
  const selected =
    state?.playlist.find((v) => v.id === selectedId) ||
    state?.playlist.find((v) => v.id === state.playback.currentId) ||
    state?.playlist[0];
  const active = state && ['loading', 'playing', 'paused'].includes(state.playback.status);
  const settings = state?.settings;
  const patchSettings = (patch: Partial<Settings>) => {
    if (settings) void task('settings', () => api.settings({ ...settings, ...patch }));
  };
  const clearPreview = () => {
    previewRun.current++;
    setPreview(null);
    void api.releasePreview();
  };
  useEffect(() => {
    if (state && !state.playlist.some((v) => v.id === selectedId)) {
      previewRun.current++;
      setPreview(null);
    }
  }, [state?.playlist, selectedId, state?.activePlaylistId]);
  useEffect(() => {
    setSelectedId('');
    setQuery('');
    clearPreview();
  }, [state?.activePlaylistId]);
  const addVideos = (text: string, fromModal = false) =>
    task('add', async () => {
      const response = await api.add(text, state?.activePlaylistId);
      setResult(response);
      if (response.errors.length) {
        setBatch(response.errors.map((e) => e.input).join('\n'));
        setModal('add');
      } else {
        setLinks('');
        setBatch('');
        if (fromModal) setModal(null);
      }
      setNotice({
        text: `已添加 ${response.added} 个视频${response.duplicates ? `，跳过 ${response.duplicates} 个重复视频` : ''}${response.errors.length ? `，${response.errors.length} 个解析失败` : ''}`,
        error: !!response.errors.length,
      });
    });
  const loadFolders = () =>
    task('folders', async () => {
      const list = await api.folders();
      setFolders(list);
    });
  useEffect(() => {
    if (tab === 'favorites' && favoriteView === 'mine' && state?.profile) void loadFolders();
  }, [tab, favoriteView, state?.profile?.mid]);
  useEffect(() => {
    if (!state?.profile) {
      setFolders([]);
      setFavorites([]);
      setFolderId(0);
      setChosen(new Set());
    }
  }, [state?.profile?.mid]);
  const loadFavorites = (id: number, nextPage = 1) =>
    task('favorites', async () => {
      const response = await api.favorites(id, nextPage);
      setFolderId(id);
      setPage(nextPage);
      setHasMore(response.hasMore);
      setFavorites(response.videos);
      setChosen(new Set());
    });
  const startVideo = (id?: string) =>
    task('start', async () => {
      clearPreview();
      await api.start(id);
    });
  const previewVideo = () =>
    task('preview', async () => {
      if (!selected) return;
      setSelectedId(selected.id);
      const run = ++previewRun.current;
      const stream = await api.preview(selected.id);
      if (run === previewRun.current) setPreview(stream);
    });
  const importFolder = () =>
    task('import', async () => {
      cancelImport.current = false;
      const summary: AddResult = { added: 0, duplicates: 0, errors: [] };
      try {
        for (let currentPage = 1; currentPage <= 1000 && !cancelImport.current; currentPage++) {
          setImportProgress(`正在读取第 ${currentPage} 页 · 已添加 ${summary.added} 个视频`);
          const response = await api.favorites(folderId, currentPage);
          if (cancelImport.current) break;
          if (response.videos.length) {
            const added = await api.add(
              response.videos.map((video) => video.bvid).join('\n'),
              state?.activePlaylistId,
            );
            summary.added += added.added;
            summary.duplicates += added.duplicates;
            summary.errors.push(...added.errors);
          }
          if (!response.hasMore) break;
        }
        setNotice({
          text: `${cancelImport.current ? '已停止导入' : '收藏夹导入完成'}：添加 ${summary.added} 个，重复 ${summary.duplicates} 个，失败 ${summary.errors.length} 个`,
          error: !!summary.errors.length,
        });
        if (summary.errors.length) {
          setResult(summary);
          setBatch(summary.errors.map((e) => e.input).join('\n'));
          setModal('add');
        }
      } finally {
        setImportProgress('');
      }
    });
  const openAdd = () => {
    setResult(null);
    setModal('add');
  };
  if (!state || !settings)
    return (
      <div className="app-loading">
        <Monitor size={40} />
        <p>正在打开 BiliDesk…</p>
        {notice && <p role="alert">{notice.text}</p>}
      </div>
    );
  const navItems = [
    { id: 'wallpapers', label: '我的壁纸', icon: ImageIcon },
    { id: 'favorites', label: '收藏夹', icon: Star },
    { id: 'collections', label: '订阅合集', icon: Layers },
    { id: 'settings', label: '播放设置', icon: SlidersHorizontal },
  ];
  const filtered = state.playlist.filter((v) =>
    `${v.title} ${v.owner} ${v.bvid}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab('wallpapers');
          }}
          aria-label="BiliDesk 首页"
        >
          <Monitor size={35} strokeWidth={1.9} />
          <span>BiliDesk</span>
        </a>
        <nav
          aria-label="主导航"
          style={{ '--nav-index': navItems.findIndex((i) => i.id === tab) } as CSSProperties}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? 'selected' : ''}`}
              aria-label={item.label}
              disabled={busy === 'import'}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => {
                clearPreview();
                setTab(item.id);
              }}
            >
              <item.icon size={22} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="platform-note">
            <span className="small-dot" />
            {api.platform === 'web'
              ? '浏览器界面预览'
              : api.platform === 'darwin'
                ? 'macOS 桌面客户端'
                : 'Windows 桌面客户端'}
          </div>
          <button
            className="account"
            aria-label={state.profile ? `${state.profile.name} 账号设置` : '访客模式 登录 Bilibili'}
            onClick={() => (state.profile ? setTab('settings') : setModal('login'))}
          >
            <div className="avatar">
              {state.profile?.avatar ? <img src={state.profile.avatar} alt="" /> : <UserRound size={23} />}
            </div>
            <div>
              <strong>{state.profile?.name || '访客模式'}</strong>
              <span>
                {state.profile ? '账号与偏好设置' : '登录 Bilibili'}
                <ChevronRight size={15} />
              </span>
            </div>
          </button>
        </div>
      </aside>
      <main className="main-content page" key={tab}>
        <header className="page-header">
          <div>
            <h1>
              {tab === 'wallpapers'
                ? '我的壁纸'
                : tab === 'favorites'
                  ? '收藏夹'
                  : tab === 'collections'
                    ? '订阅合集'
                    : '播放设置'}
            </h1>
            <p>
              {tab === 'wallpapers'
                ? '让喜欢的视频，成为桌面的风景'
                : tab === 'favorites'
                  ? '把珍藏的每一帧，带到桌面上'
                  : tab === 'collections'
                    ? '把订阅的精彩，加入桌面播放列表'
                    : '让壁纸按照你的习惯播放'}
            </p>
          </div>
          {tab === 'wallpapers' && (
            <button className="button primary" onClick={openAdd}>
              <Plus size={19} />
              添加视频
            </button>
          )}
          {tab === 'favorites' && favoriteView === 'mine' && state.profile && (
            <button className="button secondary" disabled={!!busy} onClick={() => void loadFolders()}>
              <RefreshCw size={17} />
              刷新收藏夹
            </button>
          )}
        </header>
        {state.accountWarning && (
          <div className="inline-message">
            <Info size={17} />
            <span>{state.accountWarning}</span>
          </div>
        )}
        {state.playback.error && (
          <div className="inline-message error" role="alert">
            <Info size={17} />
            <span>{state.playback.error}</span>
            <button
              aria-label="清除播放错误"
              className="icon-button"
              onClick={() => void task('stop', api.stop)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {tab === 'wallpapers' && (
          <>
            <div className="hero-grid">
              <section className="preview-section" aria-label="壁纸预览">
                <div className="preview-frame">
                  {preview ? (
                    <MediaPlayer
                      stream={preview}
                      settings={settings}
                      controls
                      onError={() => {
                        clearPreview();
                        setNotice({ text: '预览加载失败，请检查网络或重新登录后重试', error: true });
                      }}
                    />
                  ) : (
                    <>
                      <img
                        key={selected?.id || 'placeholder'}
                        className="preview-image"
                        src={selected?.cover || './alpine.png'}
                        alt={selected ? selected.title : '阳光下的阿尔卑斯山绿色草甸，壁纸预览示意图'}
                      />
                      {selected && (
                        <button
                          className="preview-play"
                          aria-label="预览选中视频"
                          onClick={() => void previewVideo()}
                          disabled={!!busy}
                        >
                          {busy === 'preview' ? (
                            <LoaderCircle size={26} className="spin" />
                          ) : (
                            <Play size={26} fill="currentColor" />
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="preview-caption">
                  <span title={selected?.title}>{selected?.title || '未选择视频'}</span>
                  <span className="subtle">
                    {preview ? (
                      <>
                        <Film size={15} />
                        {qualityName(preview.quality)}
                        <button className="text-button" onClick={clearPreview}>
                          关闭预览
                        </button>
                      </>
                    ) : (
                      <>
                        <ImageIcon size={15} />
                        {selected ? '视频封面' : '预览示意'}
                      </>
                    )}
                  </span>
                </div>
              </section>
              <section className="control-panel">
                <h2>壁纸控制</h2>
                <div className="control-row">
                  <span>
                    <Play size={18} />
                    状态
                  </span>
                  <span className={`status ${state.playback.status}`}>
                    <i />
                    {statusLabels[state.playback.status] || state.playback.status}
                  </span>
                </div>
                <label className="control-row">
                  <span>
                    <Monitor size={19} />
                    屏幕
                  </span>
                  <select
                    aria-label="目标屏幕"
                    value={settings.displayId}
                    disabled={!!busy}
                    onChange={(e) => patchSettings({ displayId: e.target.value })}
                  >
                    <option value="primary">主显示器</option>
                    {state.displays.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label} · {d.width}×{d.height}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="control-row">
                  <span>
                    <ListVideo size={19} />
                    播放模式
                  </span>
                  <select
                    aria-label="播放模式"
                    value={settings.mode}
                    disabled={!!busy}
                    onChange={(e) => patchSettings({ mode: e.target.value as Settings['mode'] })}
                  >
                    {Object.entries(modes).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="control-row volume-row">
                  <span>
                    <Volume2 size={19} />
                    音量
                  </span>
                  <input
                    aria-label="壁纸音量"
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    style={{ '--value': `${volume}%` } as CSSProperties}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    onPointerUp={() => patchSettings({ volume })}
                    onKeyUp={() => patchSettings({ volume })}
                  />
                  <span className="volume-value">{volume === 0 ? <VolumeX size={18} /> : `${volume}%`}</span>
                </label>
                <div className="wallpaper-actions">
                  {active ? (
                    <>
                      <button
                        className="button primary"
                        disabled={!!busy || state.playback.status === 'loading'}
                        onClick={() => void task('pause', api.pause)}
                      >
                        {state.playback.status === 'loading' ? (
                          <LoaderCircle size={18} className="spin" />
                        ) : state.playback.status === 'paused' ? (
                          <Play size={18} />
                        ) : (
                          <Pause size={18} />
                        )}
                        {state.playback.status === 'loading'
                          ? '正在连接视频…'
                          : state.playback.status === 'paused'
                            ? '继续播放'
                            : '暂停播放'}
                      </button>
                      <div className="playback-secondary">
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() => void task('next', api.next)}
                        >
                          <SkipForward size={16} />
                          下一视频
                        </button>
                        <button className="button secondary" onClick={() => void task('stop', api.stop)}>
                          <Square size={15} />
                          停止壁纸
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      className="button primary"
                      disabled={!!busy || !selected}
                      onClick={() => void startVideo(selected?.id)}
                    >
                      <Play size={19} />
                      启用动态壁纸
                    </button>
                  )}
                </div>
              </section>
            </div>
            <form
              className="quick-add"
              onSubmit={(e) => {
                e.preventDefault();
                void addVideos(links);
              }}
            >
              <div className="input-with-icon">
                <Link2 size={21} />
                <input
                  ref={input}
                  aria-label="Bilibili 视频链接"
                  placeholder="粘贴 Bilibili 视频链接，支持批量添加"
                  value={links}
                  onChange={(e) => setLinks(e.target.value)}
                />
              </div>
              <button className="button primary" disabled={!!busy || !links.trim()} type="submit">
                {busy === 'add' ? <LoaderCircle size={18} className="spin" /> : null}
                {busy === 'add' ? '正在解析' : '解析链接'}
              </button>
            </form>
            <section className="playlist">
              <PlaylistManager state={state} disabled={!!busy} />
              <CloudSyncPanel
                key={state.activePlaylistId}
                playlistId={state.activePlaylistId}
                playlistName={
                  state.playlists.find((p) => p.id === state.activePlaylistId)?.name || '播放列表'
                }
                profile={state.profile}
                state={state.cloudSync}
                count={state.playlist.length}
                login={() => setModal('login')}
              />
              <div className="section-heading">
                <div>
                  <h2>{state.playlists.find((p) => p.id === state.activePlaylistId)?.name || '播放列表'}</h2>
                  <span>{state.playlist.length} 个视频</span>
                </div>
                {state.playlist.length > 0 && (
                  <label className="search-input">
                    <Search size={16} />
                    <input
                      aria-label="搜索播放列表"
                      placeholder="搜索视频"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                )}
              </div>
              {!state.playlist.length ? (
                <div className="empty-playlist">
                  <div className="empty-monitor">
                    <Monitor size={54} strokeWidth={1.4} />
                    <Play size={16} fill="currentColor" />
                  </div>
                  <h3>添加第一个视频</h3>
                  <p>支持 BV 号、视频链接和 b23.tv 短链接</p>
                  <button className="button outline" onClick={openAdd}>
                    <Plus size={18} />
                    添加视频
                  </button>
                </div>
              ) : (
                <PlaylistVideos
                  key={state.activePlaylistId}
                  state={state}
                  filtered={filtered}
                  query={query}
                  selectedId={selected?.id}
                  disabled={!!busy}
                  task={task}
                  select={(id) => {
                    clearPreview();
                    setSelectedId(id);
                  }}
                  play={startVideo}
                  clearPreview={clearPreview}
                />
              )}
            </section>
            <p className="footnote">
              <Info size={15} />
              仅播放你有权访问的视频。
            </p>
          </>
        )}
        {tab === 'favorites' && (
          <>
            <div className="favorite-tabs" role="tablist" aria-label="收藏夹来源">
              <button
                role="tab"
                aria-selected={favoriteView === 'subscriptions'}
                onClick={() => setFavoriteView('subscriptions')}
              >
                订阅收藏夹
              </button>
              <button
                role="tab"
                aria-selected={favoriteView === 'mine'}
                onClick={() => setFavoriteView('mine')}
              >
                我的收藏夹
              </button>
            </div>
            {favoriteView === 'subscriptions' ? (
              <Subscriptions key={state.activePlaylistId} subscriptions={state.subscriptions || []} />
            ) : !state.profile ? (
              <section className="signed-out">
                <div className="large-icon">
                  <FolderOpen size={44} strokeWidth={1.5} />
                  <Star size={19} />
                </div>
                <h2>你的收藏，新的风景</h2>
                <p>
                  扫码登录 Bilibili，选择收藏夹中的视频，
                  <br />
                  一键加入桌面轮播列表。
                </p>
                <button className="button primary" onClick={() => setModal('login')}>
                  <UserRound size={18} />
                  登录 Bilibili
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setTab('wallpapers');
                    openAdd();
                  }}
                >
                  也可以匿名添加视频链接
                  <ChevronRight size={15} />
                </button>
                <div className="privacy-line">
                  <ShieldCheck size={16} />
                  仅在本机保存登录信息
                </div>
              </section>
            ) : (
              <div className="favorites-layout">
                <section className="folder-list">
                  <h2>
                    我的收藏夹 <span>{folders.length}</span>
                  </h2>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      disabled={!!busy}
                      className={`folder-item ${folder.id === folderId ? 'selected' : ''}`}
                      onClick={() => void loadFavorites(folder.id)}
                    >
                      <FolderOpen size={21} />
                      <span>
                        <strong>{folder.title}</strong>
                        <small>{folder.count} 个内容</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                  {!folders.length && (
                    <p className="muted">
                      {busy === 'folders'
                        ? '正在获取收藏夹…'
                        : '暂无收藏夹，或尚未成功加载。可点击刷新重试。'}
                    </p>
                  )}
                </section>
                <section className="favorite-content">
                  {folderId ? (
                    <>
                      <div className="section-heading">
                        <div>
                          <h2>{folders.find((f) => f.id === folderId)?.title}</h2>
                          <span>第 {page} 页</span>
                        </div>
                        <button
                          className="button outline small"
                          disabled={!!busy}
                          onClick={() => void importFolder()}
                        >
                          导入整个收藏夹
                        </button>
                      </div>
                      {importProgress && (
                        <div className="inline-message" role="status">
                          <LoaderCircle size={16} className="spin" />
                          <span>{importProgress}</span>
                          <button
                            className="text-button"
                            onClick={() => {
                              cancelImport.current = true;
                              setImportProgress('正在完成当前批次，然后停止…');
                            }}
                          >
                            停止导入
                          </button>
                        </div>
                      )}
                      <div className="favorite-toolbar">
                        <label>
                          <input
                            type="checkbox"
                            checked={favorites.length > 0 && chosen.size === favorites.length}
                            onChange={(e) =>
                              setChosen(e.target.checked ? new Set(favorites.map((v) => v.bvid)) : new Set())
                            }
                          />
                          选择本页
                        </label>
                        <button
                          className="button primary small"
                          disabled={!chosen.size || !!busy}
                          onClick={() => void addVideos([...chosen].join('\n'))}
                        >
                          {busy === 'add' ? '正在导入…' : `加入播放列表 (${chosen.size})`}
                        </button>
                      </div>
                      {favorites.map((video) => (
                        <label className="favorite-video" key={video.bvid}>
                          <input
                            type="checkbox"
                            checked={chosen.has(video.bvid)}
                            onChange={(e) =>
                              setChosen((old) => {
                                const next = new Set(old);
                                e.target.checked ? next.add(video.bvid) : next.delete(video.bvid);
                                return next;
                              })
                            }
                          />
                          <img src={video.cover} alt="" />
                          <div>
                            <h3>{video.title}</h3>
                            <p>
                              {video.owner} · {duration(video.duration)}
                            </p>
                          </div>
                        </label>
                      ))}
                      {!favorites.length && <div className="no-results">本页没有可用的视频</div>}
                      <div className="pagination">
                        <button
                          className="button secondary small"
                          disabled={page === 1 || !!busy}
                          onClick={() => void loadFavorites(folderId, page - 1)}
                        >
                          上一页
                        </button>
                        <span>第 {page} 页</span>
                        <button
                          className="button secondary small"
                          disabled={!hasMore || !!busy}
                          onClick={() => void loadFavorites(folderId, page + 1)}
                        >
                          下一页
                        </button>
                      </div>
                      <p className="footnote">
                        收藏夹为手动导入；多 P 视频默认导入 P1，可用带 p 参数的链接添加其他分 P。
                      </p>
                    </>
                  ) : (
                    <div className="folder-placeholder">
                      <FolderOpen size={42} strokeWidth={1.3} />
                      <p>选择左侧收藏夹，查看其中的视频</p>
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
        {tab === 'collections' && (
          <Collections
            key={state.activePlaylistId}
            playlistId={state.activePlaylistId}
            profile={state.profile}
            login={() => setModal('login')}
          />
        )}
        {tab === 'settings' && (
          <div className="settings-content">
            <section className="settings-section">
              <h2>播放偏好</h2>
              <div className="setting-item">
                <div>
                  <Film size={20} />
                  <span>
                    <strong>优先清晰度</strong>
                    <small>使用当前账号可用的清晰度，默认优先 H.264 编码</small>
                  </span>
                </div>
                <select
                  aria-label="优先清晰度"
                  disabled={!!busy}
                  value={settings.quality}
                  onChange={(e) => patchSettings({ quality: Number(e.target.value) })}
                >
                  <option value="32">480P · 节省流量</option>
                  <option value="64">720P · 高清</option>
                  <option value="80">1080P · 推荐</option>
                  <option value="120">4K · 需账号权限</option>
                </select>
              </div>
              <div className="setting-item">
                <div>
                  <Maximize size={20} />
                  <span>
                    <strong>画面适配</strong>
                    <small>填满屏幕可能裁剪边缘，完整显示会保留黑边</small>
                  </span>
                </div>
                <select
                  aria-label="画面适配"
                  disabled={!!busy}
                  value={settings.fit}
                  onChange={(e) => patchSettings({ fit: e.target.value as Settings['fit'] })}
                >
                  <option value="cover">填满屏幕</option>
                  <option value="contain">完整显示</option>
                </select>
              </div>
              <div className="setting-item">
                <div>
                  <Layers size={20} />
                  <span>
                    <strong>竖屏视频联屏</strong>
                    <small>自动识别竖屏，横向重复同一画面；每列等比填充，可能轻微裁剪</small>
                  </span>
                </div>
                <select
                  aria-label="竖屏视频联屏"
                  disabled={!!busy}
                  value={settings.portraitColumns}
                  onChange={(e) => patchSettings({ portraitColumns: Number(e.target.value) })}
                >
                  <option value={0}>自动 · 按屏幕比例</option>
                  <option value={-1}>关闭 · 使用画面适配</option>
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} 联屏
                    </option>
                  ))}
                </select>
              </div>
              <div className="setting-item">
                <div>
                  <Clock3 size={20} />
                  <span>
                    <strong>轮播切换时机</strong>
                    <small>视频提前播放结束时，也会按播放模式切换</small>
                  </span>
                </div>
                <select
                  aria-label="轮播间隔"
                  disabled={!!busy}
                  value={settings.interval}
                  onChange={(e) => patchSettings({ interval: Number(e.target.value) })}
                >
                  <option value="0">视频播放结束后</option>
                  <option value="60">每 1 分钟</option>
                  <option value="300">每 5 分钟</option>
                  <option value="900">每 15 分钟</option>
                  <option value="1800">每 30 分钟</option>
                </select>
              </div>
            </section>
            <section className="settings-section">
              <h2>系统与性能</h2>
              <div className="setting-item">
                <div>
                  <Pause size={20} />
                  <span>
                    <strong>桌面被遮挡时暂停</strong>
                    <small>
                      默认开启；壁纸所在屏幕被最大化、全屏或其他窗口完全覆盖时暂停，重新可见后继续
                    </small>
                  </span>
                </div>
                <button
                  className={`switch ${settings.pauseWhenDesktopHidden ? 'on' : ''}`}
                  role="switch"
                  aria-label="桌面被遮挡时暂停"
                  aria-checked={settings.pauseWhenDesktopHidden}
                  disabled={!!busy}
                  onClick={() => patchSettings({ pauseWhenDesktopHidden: !settings.pauseWhenDesktopHidden })}
                >
                  <span />
                </button>
              </div>
              <div className="setting-item">
                <div>
                  <Clock3 size={20} />
                  <span>
                    <strong>壁纸顶部进度条</strong>
                    <small>默认关闭；在壁纸顶部显示当前视频的 2 像素细进度线，不影响桌面点击</small>
                  </span>
                </div>
                <button
                  className={`switch ${settings.showProgressBar ? 'on' : ''}`}
                  role="switch"
                  aria-label="壁纸顶部进度条"
                  aria-checked={settings.showProgressBar}
                  disabled={!!busy}
                  onClick={() => patchSettings({ showProgressBar: !settings.showProgressBar })}
                >
                  <span />
                </button>
              </div>
              <div className="setting-item">
                <div>
                  <Play size={20} />
                  <span>
                    <strong>启动后自动播放</strong>
                    <small>默认开启；启动应用时播放当前列表的第一个视频，空列表不播放</small>
                  </span>
                </div>
                <button
                  className={`switch ${settings.autoPlayOnLaunch ? 'on' : ''}`}
                  role="switch"
                  aria-label="启动后自动播放"
                  aria-checked={settings.autoPlayOnLaunch}
                  disabled={!!busy}
                  onClick={() => patchSettings({ autoPlayOnLaunch: !settings.autoPlayOnLaunch })}
                >
                  <span />
                </button>
              </div>
              <div className="setting-item">
                <div>
                  <Battery size={20} />
                  <span>
                    <strong>电池供电时暂停</strong>
                    <small>连接电源后恢复播放，锁屏和睡眠时自动暂停</small>
                  </span>
                </div>
                <button
                  className={`switch ${settings.pauseOnBattery ? 'on' : ''}`}
                  role="switch"
                  aria-label="电池供电时暂停"
                  aria-checked={settings.pauseOnBattery}
                  disabled={!!busy}
                  onClick={() => patchSettings({ pauseOnBattery: !settings.pauseOnBattery })}
                >
                  <span />
                </button>
              </div>
              <div className="setting-item">
                <div>
                  <Monitor size={20} />
                  <span>
                    <strong>开机启动</strong>
                    <small>登录系统后在托盘中启动 BiliDesk，播放行为遵循「启动后自动播放」</small>
                  </span>
                </div>
                <button
                  className={`switch ${settings.launchAtLogin ? 'on' : ''}`}
                  role="switch"
                  aria-label="开机启动"
                  aria-checked={settings.launchAtLogin}
                  disabled={!!busy}
                  onClick={() => patchSettings({ launchAtLogin: !settings.launchAtLogin })}
                >
                  <span />
                </button>
              </div>
            </section>
            <section className="settings-section">
              <h2>账号</h2>
              <div className="setting-item">
                <div>
                  <ShieldCheck size={20} />
                  <span>
                    <strong>{state.profile?.name || '当前为访客模式'}</strong>
                    <small>
                      {state.profile
                        ? `UID ${state.profile.mid} · 凭据仅保存在本机`
                        : '匿名模式可添加公开视频，登录后可以导入自己的收藏夹'}
                    </small>
                  </span>
                </div>
                {state.profile ? (
                  <button
                    className="button secondary small"
                    disabled={!!busy}
                    onClick={() => {
                      clearPreview();
                      void task('logout', api.logout);
                    }}
                  >
                    <LogOut size={16} />
                    退出登录
                  </button>
                ) : (
                  <button className="button outline small" onClick={() => setModal('login')}>
                    登录 Bilibili
                  </button>
                )}
              </div>
            </section>
            <div className="about">
              <Monitor size={23} />
              <strong>BiliDesk</strong>
              <span>{version}</span>
              <p>为喜欢的画面，留一个位置。</p>
              <small>非 Bilibili 官方客户端 · Windows / macOS</small>
            </div>
          </div>
        )}
      </main>
      <Toast notice={notice} dismiss={() => setNotice(null)} />
      {modal === 'add' && (
        <Modal title="添加视频" close={closeModal} wide>
          <p className="modal-description">
            粘贴 Bilibili 链接或 BV 号，每行一个。无需登录即可添加公开视频。
          </p>
          <textarea
            className="batch-input"
            autoFocus
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            placeholder={
              'https://www.bilibili.com/video/BV…\nhttps://b23.tv/…\n也支持 av 号和带 ?p=2 的分 P 链接'
            }
            aria-label="批量视频链接"
            disabled={busy === 'add'}
          />
          <div className="input-hint">每次最多 100 个链接，重复视频会自动跳过。</div>
          {result && result.errors.length > 0 && (
            <div className="batch-errors" role="alert">
              {result.errors.map((error, i) => (
                <p key={i}>
                  <strong>{error.input}</strong>
                  <span>{error.message}</span>
                </p>
              ))}
            </div>
          )}
          <div className="modal-footer">
            <button className="button secondary" onClick={closeModal}>
              取消
            </button>
            <button
              className="button primary"
              disabled={!!busy || !batch.trim()}
              onClick={() => void addVideos(batch, true)}
            >
              {busy === 'add' ? <LoaderCircle size={18} className="spin" /> : <Plus size={18} />}
              {busy === 'add' ? '正在解析…' : '添加到播放列表'}
            </button>
          </div>
        </Modal>
      )}
      {modal === 'login' && (
        <Modal title="登录 Bilibili" close={closeModal}>
          <Login success={loginSuccess} />
        </Modal>
      )}
    </div>
  );
}
type Notice = { text: string; error?: boolean } | null;
// Keeps the last notice mounted while it transitions out along the path it came in on.
function Toast({ notice, dismiss }: { notice: Notice; dismiss(): void }) {
  const [shown, setShown] = useState<Notice>(notice);
  useEffect(() => {
    if (notice) setShown(notice);
  }, [notice]);
  if (!shown) return null;
  return (
    <div
      className={`toast ${shown.error ? 'toast-error' : ''}`}
      role={shown.error ? 'alert' : 'status'}
      data-leaving={notice ? undefined : ''}
      onTransitionEnd={(e) => {
        if (!notice && e.target === e.currentTarget && e.propertyName === 'opacity') setShown(null);
      }}
    >
      {shown.error ? <Info size={19} /> : <Check size={19} />}
      <span>{shown.text}</span>
      <button aria-label="关闭提示" className="icon-button" onClick={dismiss}>
        <X size={17} />
      </button>
    </div>
  );
}
