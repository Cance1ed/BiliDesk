// Transform only the requested entries; never replace the list from a stale UI snapshot.
function removeVideos(videos, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some((id) => typeof id !== 'string'))
    throw new Error('请选择要删除的视频');
  const removed = new Set(ids);
  return videos.filter((video) => !removed.has(video.id));
}

function moveVideo(videos, id, targetId, position) {
  if (typeof id !== 'string' || typeof targetId !== 'string' || !['before', 'after'].includes(position))
    throw new Error('无效排序');
  const source = videos.find((video) => video.id === id);
  if (!source || !videos.some((video) => video.id === targetId)) throw new Error('视频已移除，请重新排序');
  if (id === targetId) return videos;
  const ordered = videos.filter((video) => video.id !== id);
  const target = ordered.findIndex((video) => video.id === targetId);
  ordered.splice(target + (position === 'after' ? 1 : 0), 0, source);
  return ordered;
}

module.exports = { removeVideos, moveVideo };
