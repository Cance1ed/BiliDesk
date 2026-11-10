import { useEffect, useRef, type RefObject } from 'react';

export function WallpaperProgress({
  video,
  source,
}: {
  video: RefObject<HTMLVideoElement | null>;
  source: string;
}) {
  const track = useRef<HTMLDivElement>(null),
    fill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const v = video.current,
      bar = track.current,
      line = fill.current;
    if (!v || !bar || !line) return;
    let frame = 0,
      lastRatio = -1,
      lastPercent = -1;
    const draw = () => {
      const ratio =
        Number.isFinite(v.duration) && v.duration > 0
          ? Math.min(1, Math.max(0, v.currentTime / v.duration))
          : 0;
      if (ratio !== lastRatio) {
        line.style.transform = `scaleX(${ratio})`;
        lastRatio = ratio;
      }
      const percent = Math.round(ratio * 100);
      if (percent !== lastPercent) {
        bar.setAttribute('aria-valuenow', String(percent));
        lastPercent = percent;
      }
    };
    // Follow the media clock on each display frame without rerendering the player.
    // Never extrapolate elapsed wall time: a buffering/paused video must stay still.
    const tick = () => {
      frame = 0;
      draw();
      if (
        !v.paused &&
        !v.ended &&
        !v.seeking &&
        v.readyState >= 3 &&
        Number.isFinite(v.duration) &&
        v.duration > 0
      )
        frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!frame) tick();
    };
    const freeze = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      draw();
    };
    const events: [string, () => void][] = [
      ...['playing', 'canplay', 'seeked', 'durationchange', 'loadedmetadata'].map(
        (event): [string, () => void] => [event, start],
      ),
      ...['pause', 'waiting', 'seeking', 'ended', 'emptied'].map((event): [string, () => void] => [
        event,
        freeze,
      ]),
    ];
    for (const [event, listener] of events) v.addEventListener(event, listener);
    start();
    return () => {
      cancelAnimationFrame(frame);
      for (const [event, listener] of events) v.removeEventListener(event, listener);
    };
  }, [video, source]);
  return (
    <div
      ref={track}
      className="wallpaper-progress"
      role="progressbar"
      aria-label="当前视频进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
    >
      <div ref={fill} style={{ transform: 'scaleX(0)' }} />
    </div>
  );
}
