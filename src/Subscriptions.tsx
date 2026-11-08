import { useRef, useState } from 'react';
import {
  BellPlus,
  FolderOpen,
  Info,
  Link2,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Check,
} from 'lucide-react';
import { api } from './api';
import type { Subscription, SubscriptionDiscovery } from './types';
const intervals = [
  { value: 15, label: '每 15 分钟' },
  { value: 60, label: '每小时' },
  { value: 360, label: '每 6 小时' },
  { value: 1440, label: '每天' },
];
const lastTime = (time: number) =>
  time
    ? new Date(time).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '尚未同步';
export function Subscriptions({ subscriptions }: { subscriptions: Subscription[] }) {
  const [input, setInput] = useState(''),
    [discovery, setDiscovery] = useState<SubscriptionDiscovery | null>(null);
  const [folder, setFolder] = useState(''),
    [interval, setInterval] = useState(60),
    [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const lookup = useRef(0);
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({
        text: (error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
        error: true,
      });
    } finally {
      setBusy('');
    }
  };
  const discover = () =>
    run('lookup', async () => {
      const request = ++lookup.current;
      setDiscovery(null);
      setFolder('');
      const found = await api.discoverSubscriptions(input);
      if (request !== lookup.current) return;
      setDiscovery(found);
      setFolder(String(found.selectedFolderId || found.folders[0]?.id || ''));
    });
  return (
    <div className="subscriptions">
      <section className="subscription-add">
        <div className="subscription-heading">
          <span className="subscription-icon">
            <BellPlus size={23} />
          </span>
          <div>
            <h2>订阅一份喜欢的收藏</h2>
            <p>指定 UP 主和收藏夹，新视频会自动加入你的壁纸播放列表。</p>
          </div>
        </div>
        <form
          className="subscription-search"
          onSubmit={(e) => {
            e.preventDefault();
            void discover();
          }}
        >
          <label className="input-with-icon">
            <Link2 size={19} />
            <input
              aria-label="UP 主 UID 或收藏夹链接"
              placeholder="输入 UP 主 UID、主页链接或收藏夹链接"
              value={input}
              disabled={!!busy}
              onChange={(e) => {
                lookup.current++;
                setInput(e.target.value);
                setDiscovery(null);
                setFolder('');
              }}
            />
          </label>
          <button className="button primary" disabled={!!busy || !input.trim()}>
            {busy === 'lookup' ? <LoaderCircle className="spin" size={17} /> : <FolderOpen size={17} />}
            查看收藏夹
          </button>
        </form>
        <p className="subscription-hint">
          例如 space.bilibili.com/123456/favlist?fid=123456789 · 公开收藏夹无需登录
        </p>
        {discovery &&
          (discovery.folders.length ? (
            <div className="subscription-selection">
              <label>
                <span>
                  选择收藏夹 <small>UID {discovery.ownerMid}</small>
                </span>
                <select
                  aria-label="要订阅的收藏夹"
                  value={folder}
                  disabled={!!busy}
                  onChange={(e) => setFolder(e.target.value)}
                >
                  {discovery.folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title} · {f.count} 个内容
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>更新频率</span>
                <select
                  aria-label="新增订阅更新频率"
                  value={interval}
                  disabled={!!busy}
                  onChange={(e) => setInterval(Number(e.target.value))}
                >
                  {intervals.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button primary"
                disabled={!!busy || !folder || subscriptions.some((s) => s.folderId === Number(folder))}
                onClick={() =>
                  void run('add', async () => {
                    await api.subscribe({
                      ownerMid: discovery.ownerMid,
                      folderId: Number(folder),
                      intervalMinutes: interval,
                    });
                    setMessage({ text: '订阅已添加，正在同步收藏夹中的视频。', error: false });
                  })
                }
              >
                {busy === 'add' ? <LoaderCircle className="spin" size={17} /> : <BellPlus size={17} />}
                {subscriptions.some((s) => s.folderId === Number(folder)) ? '已订阅' : '订阅收藏夹'}
              </button>
            </div>
          ) : (
            <div className="inline-message">
              <Info size={17} />
              未找到可访问的收藏夹。请核对 UID，或登录有访问权限的账号后重试。
            </div>
          ))}
        {message && (
          <div
            className={`inline-message ${message.error ? 'error' : ''}`}
            role={message.error ? 'alert' : 'status'}
          >
            {message.error ? <Info size={17} /> : <Check size={17} />}
            <span>{message.text}</span>
          </div>
        )}
      </section>
      <div className="section-heading">
        <div>
          <h2>已订阅</h2>
          <span>{subscriptions.length} / 20</span>
        </div>
      </div>
      {subscriptions.length === 0 ? (
        <div className="subscription-empty">
          <BellPlus size={38} strokeWidth={1.4} />
          <h3>让喜欢的收藏持续更新</h3>
          <p>添加一个订阅，BiliDesk 会在运行时定期检查新视频。</p>
        </div>
      ) : (
        <div className="subscription-list">
          {subscriptions.map((s) => (
            <article key={s.id} className="subscription-row">
              <div className="subscription-identity">
                <FolderOpen size={24} />
                <div>
                  <h3>{s.title}</h3>
                  <p>
                    {s.ownerName || 'UP 主'} · UID {s.ownerMid} · 收藏夹 {s.folderId}
                  </p>
                </div>
                <span className={`status ${s.syncing ? 'loading' : s.enabled ? 'playing' : ''}`}>
                  {s.syncing ? '同步中' : s.enabled ? '自动更新' : '已暂停'}
                </span>
              </div>
              <div className="subscription-meta">
                <span>
                  {s.syncing
                    ? `正在同步 · 本次已添加 ${s.addedLast} 个视频`
                    : `${lastTime(s.lastSyncAt)}${s.lastSyncAt ? ` · ${s.videoCount} 个视频 · 上次新增 ${s.addedLast} 个` : ''}`}
                </span>
              </div>
              {s.lastError && (
                <p className="subscription-error" role="alert">
                  <Info size={15} />
                  {s.lastError}
                </p>
              )}
              <div className="subscription-actions">
                <select
                  aria-label={`${s.title} 更新频率`}
                  value={s.intervalMinutes}
                  disabled={!!busy || s.syncing}
                  onChange={(e) =>
                    void run(s.id, () =>
                      api.updateSubscription(s.id, {
                        enabled: s.enabled,
                        intervalMinutes: Number(e.target.value),
                      }),
                    )
                  }
                >
                  {intervals.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
                <div>
                  <button
                    className="button secondary small"
                    disabled={!!busy || s.syncing || !s.enabled}
                    onClick={() => void run(s.id, () => api.syncSubscription(s.id))}
                  >
                    <RefreshCw size={15} className={s.syncing ? 'spin' : ''} />
                    立即同步
                  </button>
                  <button
                    className="button secondary small"
                    disabled={!!busy}
                    onClick={() =>
                      void run(s.id, () =>
                        api.updateSubscription(s.id, {
                          enabled: !s.enabled,
                          intervalMinutes: s.intervalMinutes,
                        }),
                      )
                    }
                  >
                    {s.enabled ? <Pause size={15} /> : <Play size={15} />}
                    {s.enabled ? '暂停订阅' : '恢复订阅'}
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`取消订阅 ${s.title}`}
                    title="取消订阅，保留已添加的视频"
                    disabled={!!busy}
                    onClick={() => void run(s.id, () => api.unsubscribe(s.id))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="footnote">
        <Info size={15} />
        首次同步导入现有视频，后续只追加新视频；暂停或取消订阅会保留已添加的视频。
      </p>
      <p className="subscription-hint">
        同步在应用运行时进行，最多保留 1000
        个播放列表视频。手动移除的视频不会被该订阅重复添加；私有收藏夹仍需账号权限。
      </p>
    </div>
  );
}
