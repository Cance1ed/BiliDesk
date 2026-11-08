import { useEffect, useState } from 'react';
import { CloudUpload, Info, LoaderCircle, RefreshCw } from 'lucide-react';
import { api } from './api';
import type { CloudSyncState, Folder, Profile } from './types';
export function CloudSyncPanel({
  profile,
  state,
  count,
  login,
  playlistId,
  playlistName,
}: {
  profile: Profile | null;
  state: CloudSyncState;
  count: number;
  login: () => void;
  playlistId: string;
  playlistName: string;
}) {
  const [folders, setFolders] = useState<Folder[]>([]),
    [target, setTarget] = useState(''),
    [automatic, setAutomatic] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [destination, setDestination] = useState(state.folderId ? 'existing' : 'new'),
    [newName, setNewName] = useState(`BiliDesk - ${playlistName}`.slice(0, 20)),
    [isPrivate, setPrivate] = useState(true);
  const matches = profile?.mid === state.ownerMid;
  useEffect(() => {
    setTarget(matches && state.folderId ? String(state.folderId) : '');
    setAutomatic(matches && state.enabled);
  }, [state.folderId, state.enabled, profile?.mid]);
  useEffect(() => {
    let active = true;
    setFolders([]);
    if (profile)
      api
        .folders()
        .then((data) => {
          if (active) setFolders(data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [profile?.mid]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="cloud-panel">
      <summary>
        <span>
          <CloudUpload size={20} />
          保存到账号收藏夹
        </span>
        <span className="cloud-summary">
          {state.syncing
            ? '正在同步…'
            : matches && state.enabled
              ? `自动同步至「${state.title}」`
              : '未开启自动同步'}
        </span>
      </summary>
      <div className="cloud-body">
        {profile ? (
          <>
            <p>
              将「{playlistName}
              」保存到自己的收藏夹。仅向所选目标追加缺少的视频，不覆盖、清空或删除任何原有收藏夹。
            </p>
            <div className="favorite-tabs" role="tablist" aria-label="保存收藏夹方式">
              <button
                role="tab"
                aria-selected={destination === 'new'}
                disabled={busy || state.syncing}
                onClick={() => setDestination('new')}
              >
                新建收藏夹
              </button>
              <button
                role="tab"
                aria-selected={destination === 'existing'}
                disabled={busy || state.syncing}
                onClick={() => setDestination('existing')}
              >
                已有收藏夹 · 仅追加
              </button>
            </div>
            {destination === 'new' && (
              <div className="cloud-new-folder">
                <label>
                  新收藏夹名称
                  <input
                    aria-label="新收藏夹名称"
                    maxLength={20}
                    value={newName}
                    disabled={busy || state.syncing}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    disabled={busy || state.syncing}
                    onChange={(e) => setPrivate(e.target.checked)}
                  />
                  私密收藏夹
                </label>
                <p className="subscription-hint">同名收藏夹已存在时会提示改名，不会复用或覆盖。</p>
              </div>
            )}
            <div className="cloud-target">
              {destination === 'existing' && (
                <>
                  <select
                    aria-label="同步目标收藏夹"
                    value={target}
                    disabled={busy || state.syncing}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">选择我的收藏夹</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title} · {f.count} 个内容
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button"
                    aria-label="刷新同步目标收藏夹"
                    disabled={busy || state.syncing}
                    onClick={() => void run(async () => setFolders(await api.folders()))}
                  >
                    <RefreshCw size={17} />
                  </button>
                </>
              )}
              <button
                className="button primary small"
                disabled={
                  (destination === 'existing' ? !target : !newName.trim()) || busy || state.syncing || !count
                }
                onClick={() =>
                  void run(async () => {
                    let folderId = Number(target);
                    if (destination === 'new') {
                      const created = await api.createFolder(
                        { title: newName.trim(), private: isPrivate },
                        playlistId,
                      );
                      folderId = created.id;
                      setFolders((old) => [...old.filter((f) => f.id !== created.id), created]);
                      setTarget(String(created.id));
                      setDestination('existing');
                    }
                    await api.configureCloudSync({ folderId, enabled: automatic }, playlistId);
                    await api.syncCloud(playlistId);
                  })
                }
              >
                {busy || state.syncing ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <CloudUpload size={16} />
                )}
                {destination === 'new' ? '新建并保存' : '追加保存并同步'}
              </button>
            </div>
            <div className="cloud-options">
              <label>
                <input
                  type="checkbox"
                  checked={automatic}
                  disabled={busy || state.syncing}
                  onChange={(e) => setAutomatic(e.target.checked)}
                />
                自动同步新增视频（点击保存后生效）
              </label>
              {matches && (state.enabled || state.syncing) && (
                <button
                  className="text-button"
                  onClick={() => void api.disableCloudSync(playlistId).catch((e) => setError(e.message))}
                >
                  {state.syncing ? '停止同步' : '关闭自动同步'}
                </button>
              )}
            </div>
            {matches && state.lastSyncAt > 0 && (
              <p className="cloud-status">
                最近完成：{new Date(state.lastSyncAt).toLocaleString('zh-CN')} · 本次已添加 {state.addedLast}{' '}
                个视频
              </p>
            )}
            {state.syncing && (
              <p className="cloud-status" role="status">
                正在保存到「{state.title}」，已添加 {state.addedLast} 个视频…
              </p>
            )}
            <p className="subscription-hint">
              只追加缺少的视频，保留收藏夹原有内容。多个分 P
              按同一稿件收藏，播放顺序和壁纸设置仅保存在本机。自动同步在应用运行时生效，失败会在 15
              分钟后重试。
            </p>
          </>
        ) : (
          <div className="cloud-login">
            <p>登录后，可把播放列表保存到账号收藏夹，并自动同步新增视频。</p>
            <button className="button secondary small" onClick={login}>
              登录 Bilibili
            </button>
          </div>
        )}
        {(error || (matches && state.lastError)) && (
          <div className="inline-message error" role="alert">
            <Info size={16} />
            <span>{error || state.lastError}</span>
          </div>
        )}
      </div>
    </details>
  );
}
