import { useEffect, useState, type RefObject } from 'react';
import { portraitLayout } from './portrait-layout.mjs';

export function usePortraitTiling(
  video: RefObject<HTMLVideoElement | null>,
  canvas: RefObject<HTMLCanvasElement | null>,
  container: RefObject<HTMLDivElement | null>,
  source: string,
  preference: number,
) {
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const v = video.current,
      c = canvas.current,
      host = container.current;
    if (!v || !c || !host) return;
    const context = c.getContext('2d', { alpha: false });
    if (!context) return;
    let frame = 0,
      fallback = 0,
      disposed = false,
      activeColumns = 1;
    const stop = () => {
      if (frame) v.cancelVideoFrameCallback(frame);
      if (fallback) cancelAnimationFrame(fallback);
      frame = 0;
      fallback = 0;
    };
    const draw = () => {
      if (disposed) return;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(host.clientWidth * ratio)),
        height = Math.max(1, Math.round(host.clientHeight * ratio));
      const layout = portraitLayout(width, height, v.videoWidth, v.videoHeight, preference);
      activeColumns = layout?.columns || 1;
      setColumns(activeColumns);
      if (!layout || activeColumns < 2 || v.readyState < 2) return;
      if (c.width !== width || c.height !== height) {
        c.width = width;
        c.height = height;
      }
      for (const cell of layout.cells)
        context.drawImage(v, cell.sx, cell.sy, cell.sw, cell.sh, cell.x, 0, cell.width, height);
    };
    const schedule = () => {
      if (disposed || v.paused || v.ended || activeColumns < 2 || frame || fallback) return;
      if (typeof v.requestVideoFrameCallback === 'function')
        frame = v.requestVideoFrameCallback(() => {
          frame = 0;
          draw();
          schedule();
        });
      else
        fallback = requestAnimationFrame(() => {
          fallback = 0;
          draw();
          schedule();
        });
    };
    const refresh = () => {
      draw();
      if (v.paused || activeColumns < 2) stop();
      else schedule();
    };
    const reset = () => {
      stop();
      activeColumns = 1;
      setColumns(1);
      context.clearRect(0, 0, c.width, c.height);
    };
    const resize = new ResizeObserver(refresh);
    resize.observe(host);
    for (const event of ['loadedmetadata', 'loadeddata', 'resize', 'seeked', 'play', 'pause', 'ended'])
      v.addEventListener(event, refresh);
    v.addEventListener('emptied', reset);
    window.addEventListener('resize', refresh);
    refresh();
    return () => {
      disposed = true;
      stop();
      resize.disconnect();
      for (const event of ['loadedmetadata', 'loadeddata', 'resize', 'seeked', 'play', 'pause', 'ended'])
        v.removeEventListener(event, refresh);
      v.removeEventListener('emptied', reset);
      window.removeEventListener('resize', refresh);
    };
  }, [source, preference, video, canvas, container]);
  return columns;
}
