import { useState } from 'react';
import { Plus, Pencil, Copy, Trash2, ListVideo, Info } from 'lucide-react';
import { api } from './api';
import { Modal } from './Modal';
import type { Snapshot } from './types';
export function PlaylistManager({ state, disabled }: { state: Snapshot; disabled: boolean }) {
  const current = state.playlists.find((p) => p.id === state.activePlaylistId)!;
  const [action, setAction] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setAction('');
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setBusy(false);
    }
  };
  const open = (kind: string) => {
    setError('');
    setName(kind === 'rename' ? current.name : kind === 'copy' ? `${current.name} 副本` : '');
    setAction(kind);
  };
  return (
    <>
      <div className="playlist-manager">
        <div className="playlist-choice">
          <ListVideo size={20} />
          <select
            aria-label="当前播放列表"
            disabled={disabled || busy}
            value={state.activePlaylistId}
            onChange={(e) => void run(() => api.activatePlaylist(e.target.value))}
          >
            {state.playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.count} 个视频
              </option>
            ))}
          </select>
        </div>
        <div className="playlist-management-actions">
          <button
            className="button secondary small"
            disabled={disabled || busy || state.playlists.length >= 20}
            onClick={() => open('new')}
          >
            <Plus size={16} />
            新建列表
          </button>
          <button
            className="icon-button"
            aria-label="重命名当前播放列表"
            disabled={disabled || busy}
            onClick={() => open('rename')}
          >
            <Pencil size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="复制当前播放列表"
            disabled={disabled || busy || state.playlists.length >= 20}
            onClick={() => open('copy')}
          >
            <Copy size={16} />
          </button>
          <button
            className="icon-button danger"
            aria-label="删除当前播放列表"
            disabled={disabled || busy || state.playlists.length <= 1}
            onClick={() => open('delete')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <p className="subscription-hint">
        每个列表独立保存视频、订阅和同步目标。切换会停止当前播放；自动同步仅运行当前列表。
      </p>
      {error && !action && (
        <div className="inline-message error" role="alert">
          <Info size={16} />
          {error}
        </div>
      )}
      {action && (
        <Modal
          title={
            action === 'delete'
              ? '删除本地播放列表'
              : action === 'rename'
                ? '重命名播放列表'
                : action === 'copy'
                  ? '复制播放列表'
                  : '新建播放列表'
          }
          close={() => {
            if (!busy) setAction('');
          }}
        >
          <form
            className="playlist-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                action === 'delete'
                  ? api.deletePlaylist(current.id)
                  : action === 'rename'
                    ? api.renamePlaylist(current.id, name)
                    : api.createPlaylist(name, action === 'copy'),
              );
            }}
          >
            {action === 'delete' ? (
              <p>
                删除「{current.name}」及其中 {current.count}{' '}
                个本地条目和订阅配置？此操作只删除本地列表，账号中的收藏夹及视频保持不变。
              </p>
            ) : (
              <>
                <label>
                  播放列表名称
                  <input
                    autoFocus
                    aria-label="播放列表名称"
                    maxLength={60}
                    value={name}
                    disabled={busy}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：风景、音乐、工作专注"
                  />
                </label>
                {action === 'copy' && <p>复制视频及顺序，订阅和账号同步保持关闭，请为副本单独配置。</p>}
              </>
            )}
            {error && (
              <div className="inline-message error" role="alert">
                {error}
              </div>
            )}
            <div className="playlist-dialog-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setAction('')}
              >
                取消
              </button>
              <button className="button primary" disabled={busy || (action !== 'delete' && !name.trim())}>
                {busy ? '正在保存…' : action === 'delete' ? '删除本地列表' : '保存'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
