import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, GripVertical, Play, Trash2 } from 'lucide-react';
import { api, duration } from './api';
import { Modal } from './Modal';
import type { Snapshot, Video } from './types';
import './playlist-videos.css';

type Props = {
  state: Snapshot;
  filtered: Video[];
  query: string;
  selectedId?: string;
  disabled: boolean;
  task: (name: string, fn: () => Promise<unknown>) => Promise<void>;
  select: (id: string) => void;
  play: (id: string) => Promise<void>;
  clearPreview: () => void;
};

export function PlaylistVideos({
  state,
  filtered,
  query,
  selectedId,
  disabled,
  task,
  select,
  play,
  clearPreview,
}: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState('');
  const [drop, setDrop] = useState<{ id: string; position: 'before' | 'after' } | null>(null);
  const [message, setMessage] = useState('');
  const dragId = useRef('');
  const selectAll = useRef<HTMLInputElement>(null);
  const indexes = useMemo(
    () => new Map(state.playlist.map((video, index) => [video.id, index])),
    [state.playlist],
  );
  // A new search starts a new selection so hidden results cannot be deleted accidentally.
  useEffect(() => {
    setChecked(new Set());
  }, [query]);
  const chosen = filtered.filter((video) => checked.has(video.id));
  const allChecked = filtered.length > 0 && chosen.length === filtered.length;
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = chosen.length > 0 && !allChecked;
  }, [chosen.length, allChecked]);
  const endDrag = () => {
    dragId.current = '';
    setDragging('');
    setDrop(null);
  };
  const dropPosition = (event: DragEvent<HTMLElement>) =>
    event.clientY < event.currentTarget.getBoundingClientRect().top + event.currentTarget.offsetHeight / 2
      ? ('before' as const)
      : ('after' as const);
  const active = ['loading', 'playing', 'paused'].includes(state.playback.status);

  return (
    <>
      <div className="playlist-edit-toolbar">
        <label className="playlist-check">
          <input
            ref={selectAll}
            type="checkbox"
            aria-label={query ? '全选搜索结果' : '全选视频'}
            checked={allChecked}
            disabled={disabled || !filtered.length}
            onChange={() => setChecked(allChecked ? new Set() : new Set(filtered.map((video) => video.id)))}
          />
          {query ? '全选搜索结果' : '全选'}
        </label>
        <span className="playlist-selection-count">
          已选 {chosen.length} / {filtered.length}
        </span>
        <button
          className="button secondary small"
          disabled={disabled || !chosen.length}
          onClick={() => setPendingDelete(chosen.map((video) => video.id))}
        >
          <Trash2 size={15} />
          删除所选{chosen.length ? `（${chosen.length}）` : ''}
        </button>
        <span className="playlist-drag-hint">拖动左侧手柄排序 · 自动保存</span>
      </div>
      <p className="playlist-edit-status" role="status">
        {message}
      </p>
      <div
        className="video-list editable-video-list"
        aria-label="播放列表视频"
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null);
        }}
      >
        {filtered.length ? (
          filtered.map((video) => {
            const index = indexes.get(video.id)!;
            return (
              <article
                key={video.id}
                data-video-id={video.id}
                className={`video-row ${selectedId === video.id ? 'current' : ''} ${checked.has(video.id) ? 'checked' : ''} ${dragging === video.id ? 'dragging' : ''} ${drop?.id === video.id ? `drop-${drop.position}` : ''}`}
                onDragOver={(event) => {
                  if (disabled || !dragId.current || dragId.current === video.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const position = dropPosition(event);
                  setDrop((previous) =>
                    previous?.id === video.id && previous.position === position
                      ? previous
                      : { id: video.id, position },
                  );
                }}
                onDrop={(event) => {
                  if (disabled || !dragId.current) return;
                  event.preventDefault();
                  const sourceId = dragId.current;
                  const position = dropPosition(event);
                  endDrag();
                  if (sourceId === video.id) return;
                  void task('move', async () => {
                    await api.move(sourceId, video.id, position, state.activePlaylistId);
                    setMessage('播放顺序已保存');
                  });
                }}
              >
                <button
                  className="icon-button playlist-drag-handle"
                  aria-label={`拖动排序 ${video.title}`}
                  title="拖动排序，也可使用右侧上下移动按钮"
                  disabled={disabled}
                  draggable={!disabled}
                  onDragStart={(event) => {
                    dragId.current = video.id;
                    setDragging(video.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', video.id);
                    setMessage('');
                  }}
                  onDragEnd={endDrag}
                >
                  <GripVertical size={18} />
                </button>
                <input
                  className="playlist-row-check"
                  type="checkbox"
                  aria-label={`勾选 ${video.title}`}
                  checked={checked.has(video.id)}
                  disabled={disabled}
                  onChange={() =>
                    setChecked((previous) => {
                      const next = new Set(previous);
                      if (next.has(video.id)) next.delete(video.id);
                      else next.add(video.id);
                      return next;
                    })
                  }
                />
                <button
                  className="video-select"
                  onClick={() => select(video.id)}
                  aria-label={`选择 ${video.title}`}
                >
                  <span className="row-number">
                    {state.playback.currentId === video.id && active ? (
                      <span className="playing-bars">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      String(index + 1).padStart(2, '0')
                    )}
                  </span>
                  <div className="thumbnail">
                    <img src={video.cover} alt="" loading="lazy" draggable={false} />
                    <span>{duration(video.duration)}</span>
                  </div>
                  <div className="video-copy">
                    <h3>{video.title}</h3>
                    <p>
                      {video.owner}
                      <span>·</span>
                      {video.bvid}
                      {video.page > 1 ? ` · P${video.page}` : ''}
                    </p>
                  </div>
                </button>
                <div className="row-actions">
                  <button
                    className="icon-button accent"
                    title="点播并设为壁纸"
                    aria-label={`播放 ${video.title}`}
                    disabled={disabled}
                    onClick={() => void play(video.id)}
                  >
                    <Play size={18} />
                  </button>
                  <button
                    className="icon-button"
                    title="上移"
                    aria-label={`上移 ${video.title}`}
                    disabled={disabled || index === 0}
                    onClick={() =>
                      void task('reorder', async () => {
                        await api.reorder(video.id, -1, state.activePlaylistId);
                        setMessage('播放顺序已保存');
                      })
                    }
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="下移"
                    aria-label={`下移 ${video.title}`}
                    disabled={disabled || index === state.playlist.length - 1}
                    onClick={() =>
                      void task('reorder', async () => {
                        await api.reorder(video.id, 1, state.activePlaylistId);
                        setMessage('播放顺序已保存');
                      })
                    }
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="在 Bilibili 打开"
                    aria-label={`打开 ${video.title}`}
                    onClick={() => void task('open', () => api.openVideo(video.id))}
                  >
                    <ExternalLink size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    title="从播放列表移除"
                    aria-label={`移除 ${video.title}`}
                    disabled={disabled}
                    onClick={() =>
                      void task('remove', async () => {
                        await api.remove(video.id, state.activePlaylistId);
                        if (selectedId === video.id) clearPreview();
                        setChecked((previous) => {
                          const next = new Set(previous);
                          next.delete(video.id);
                          return next;
                        });
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="no-results">没有找到匹配的视频</div>
        )}
      </div>
      {pendingDelete && (
        <Modal
          title="删除所选视频"
          close={() => {
            if (!disabled) setPendingDelete(null);
          }}
        >
          <div className="playlist-dialog">
            <p>
              从「{state.playlists.find((list) => list.id === state.activePlaylistId)?.name}」删除所选的{' '}
              {pendingDelete.length} 个视频？只移除本地条目，账号收藏夹保持不变。
            </p>
            {pendingDelete.includes(state.playback.currentId || '') && (
              <p>当前播放的视频也被选中，删除后会停止壁纸播放。</p>
            )}
            <div className="playlist-dialog-actions">
              <button className="button secondary" disabled={disabled} onClick={() => setPendingDelete(null)}>
                取消
              </button>
              <button
                className="button primary"
                disabled={disabled}
                onClick={() =>
                  void task('remove-many', async () => {
                    await api.removeMany(pendingDelete, state.activePlaylistId);
                    if (pendingDelete.includes(selectedId || '')) clearPreview();
                    setChecked(new Set());
                    setPendingDelete(null);
                    setMessage(`已删除 ${pendingDelete.length} 个本地条目`);
                  })
                }
              >
                {disabled ? '正在删除…' : '确认删除'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
