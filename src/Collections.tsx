import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FolderOpen, Layers, LoaderCircle, RefreshCw, UserRound, Info } from 'lucide-react';
import { api, duration } from './api';
import type { Collection, Favorite, Profile } from './types';
export function Collections({
  profile,
  login,
  playlistId,
}: {
  profile: Profile | null;
  login: () => void;
  playlistId: string;
}) {
  const [collections, setCollections] = useState<Collection[]>([]),
    [listPage, setListPage] = useState(1),
    [listMore, setListMore] = useState(false);
  const [selected, setSelected] = useState<Collection | null>(null),
    [videos, setVideos] = useState<Favorite[]>([]),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const cancelled = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    cancelled.current = false;
    setCollections([]);
    setSelected(null);
    setChosen(new Set());
    if (profile) void loadList(1, token);
    return () => {
      cancelled.current = true;
      generation.current++;
    };
  }, [profile?.mid]);
  async function loadList(p: number, token = generation.current) {
    setBusy('list');
    setError('');
    try {
      const data = await api.collections(p);
      if (token !== generation.current) return;
      setCollections(data.collections);
      setListMore(data.hasMore);
      setListPage(p);
    } catch (e) {
      if (token === generation.current) setError((e as Error).message);
    } finally {
      if (token === generation.current) setBusy('');
    }
  }
  async function loadVideos(collection: Collection, p = 1) {
    const token = generation.current;
    setBusy('videos');
    setError('');
    try {
      const data = await api.collectionVideos(collection.id, collection.ownerMid, p);
      if (token !== generation.current) return;
      if (selected?.id !== collection.id) setChosen(new Set());
      setSelected(collection);
      setVideos(data.videos);
      setPage(p);
      setMore(data.hasMore);
    } catch (e) {
      if (token === generation.current) setError((e as Error).message);
    } finally {
      if (token === generation.current) setBusy('');
    }
  }
  async function importVideos(all: boolean) {
    if (!selected) return;
    const token = generation.current;
    cancelled.current = false;
    setBusy('import');
    setError('');
    let added = 0,
      duplicates = 0,
      failed = 0;
    const failures: string[] = [];
    const add = async (ids: string[]) => {
      for (let start = 0; start < ids.length && !cancelled.current; start += 30) {
        const result = await api.add(ids.slice(start, start + 30).join('\n'), playlistId);
        added += result.added;
        duplicates += result.duplicates;
        failed += result.errors.length;
        failures.push(...result.errors.slice(0, 3).map((e) => e.message));
        if (token !== generation.current) return;
        setMessage(`已添加 ${added} 个，跳过 ${duplicates} 个重复，${failed} 个失败`);
        if (result.errors.some((e) => /1000|已满|限制了请求|HTTP (412|429)/.test(e.message))) {
          cancelled.current = true;
          return;
        }
      }
    };
    try {
      if (all) {
        for (let p = 1; p <= 334 && !cancelled.current; p++) {
          setMessage(`正在读取第 ${p} 页 · 已添加 ${added} 个视频`);
          const data = await api.collectionVideos(selected.id, selected.ownerMid, p);
          if (token !== generation.current || cancelled.current) break;
          await add(data.videos.map((v) => v.bvid));
          if (!data.hasMore) break;
          if (p === 334) throw new Error('合集内容过多，请改为分页选择导入');
        }
      } else await add([...chosen]);
      if (token === generation.current) {
        setMessage(
          `${cancelled.current ? '已停止' : '导入完成'}：添加 ${added} 个，重复 ${duplicates} 个，失败 ${failed} 个`,
        );
        if (failed) setError(failures.slice(0, 3).join('；'));
        if (!failed && !cancelled.current) setChosen(new Set());
      }
    } catch (e) {
      if (token === generation.current) setError(`已添加 ${added} 个视频；${(e as Error).message}`);
    } finally {
      if (token === generation.current) setBusy('');
    }
  }
  if (!profile)
    return (
      <section className="signed-out">
        <div className="large-icon">
          <Layers size={44} />
        </div>
        <h2>订阅的合集，加入桌面轮播</h2>
        <p>
          登录后读取你在 Bilibili 订阅的合集，
          <br />
          整合集导入，或只选择喜欢的视频。
        </p>
        <button className="button primary" onClick={login}>
          <UserRound size={18} />
          登录 Bilibili
        </button>
      </section>
    );
  return (
    <div className="collections-page">
      <div className="collection-toolbar">
        <p>读取当前账号订阅的合集，支持跨页选择视频。</p>
        <button className="button secondary small" disabled={!!busy} onClick={() => void loadList(listPage)}>
          <RefreshCw size={16} />
          刷新合集
        </button>
      </div>
      {error && (
        <div className="inline-message error" role="alert">
          <Info size={16} />
          <span>{error.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}</span>
        </div>
      )}
      {message && (
        <div className="inline-message" role="status">
          {busy === 'import' && <LoaderCircle className="spin" size={16} />}
          <span>{message}</span>
          {busy === 'import' && (
            <button
              className="text-button"
              onClick={() => {
                cancelled.current = true;
                setMessage('当前批次完成后停止…');
              }}
            >
              停止导入
            </button>
          )}
        </div>
      )}
      <div className="favorites-layout">
        <section className="folder-list">
          <h2>
            订阅合集 <span>第 {listPage} 页</span>
          </h2>
          {collections.map((c) => (
            <button
              key={c.id}
              disabled={!!busy}
              className={`folder-item ${selected?.id === c.id ? 'selected' : ''}`}
              onClick={() => void loadVideos(c)}
            >
              <Layers size={21} />
              <span>
                <strong>{c.title}</strong>
                <small>
                  {c.owner} · {c.count} 个视频
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          {!collections.length && (
            <p className="muted">
              {busy === 'list' ? '正在读取…' : '本页没有订阅的合集。若有下一页，可继续查看。'}
            </p>
          )}
          <div className="pagination">
            <button
              className="button secondary small"
              disabled={!!busy || listPage === 1}
              onClick={() => void loadList(listPage - 1)}
            >
              上一页
            </button>
            <button
              className="button secondary small"
              disabled={!!busy || !listMore}
              onClick={() => void loadList(listPage + 1)}
            >
              下一页
            </button>
          </div>
        </section>
        <section className="favorite-content">
          {selected ? (
            <>
              <div className="section-heading">
                <div>
                  <h2>{selected.title}</h2>
                  <span>第 {page} 页</span>
                </div>
                <button
                  className="button outline small"
                  disabled={!!busy}
                  onClick={() => void importVideos(true)}
                >
                  导入整个合集
                </button>
              </div>
              <div className="favorite-toolbar">
                <label>
                  <input
                    type="checkbox"
                    disabled={!!busy}
                    checked={videos.length > 0 && videos.every((v) => chosen.has(v.bvid))}
                    onChange={(e) =>
                      setChosen((old) => {
                        const next = new Set(old);
                        videos.forEach((v) => (e.target.checked ? next.add(v.bvid) : next.delete(v.bvid)));
                        return next;
                      })
                    }
                  />
                  选择本页
                </label>
                <button
                  className="button primary small"
                  disabled={!!busy || !chosen.size}
                  onClick={() => void importVideos(false)}
                >
                  加入播放列表 ({chosen.size})
                </button>
              </div>
              {videos.map((v) => (
                <label className="favorite-video" key={v.bvid}>
                  <input
                    type="checkbox"
                    disabled={!!busy}
                    checked={chosen.has(v.bvid)}
                    onChange={(e) =>
                      setChosen((old) => {
                        const next = new Set(old);
                        e.target.checked ? next.add(v.bvid) : next.delete(v.bvid);
                        return next;
                      })
                    }
                  />
                  <img src={v.cover} alt="" />
                  <div>
                    <h3>{v.title}</h3>
                    <p>{duration(v.duration)}</p>
                  </div>
                </label>
              ))}
              {!videos.length && <div className="no-results">本页没有可用的视频</div>}
              <div className="pagination">
                <button
                  className="button secondary small"
                  disabled={!!busy || page === 1}
                  onClick={() => void loadVideos(selected, page - 1)}
                >
                  上一页
                </button>
                <span>
                  第 {page} 页 · 已选 {chosen.size} 个
                </span>
                <button
                  className="button secondary small"
                  disabled={!!busy || !more}
                  onClick={() => void loadVideos(selected, page + 1)}
                >
                  下一页
                </button>
              </div>
            </>
          ) : (
            <div className="folder-placeholder">
              <FolderOpen size={42} />
              <p>选择左侧合集，查看其中的视频</p>
            </div>
          )}
        </section>
      </div>
      <p className="footnote">
        <Info size={15} />
        导入时自动去重，多 P 视频默认加入 P1。导入完成后可在「我的壁纸」中播放和排序。
      </p>
    </div>
  );
}
