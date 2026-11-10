import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { Settings, Stream } from './types';
import { usePortraitTiling } from './usePortraitTiling';
import { WallpaperProgress } from './WallpaperProgress';
type Props = {
  stream: Stream;
  settings: Settings;
  paused?: boolean;
  controls?: boolean;
  progressBar?: boolean;
  onPlaying?: () => void;
  onEnded?: () => void;
  onError?: () => void;
};
export function MediaPlayer({
  stream,
  settings,
  paused = false,
  controls = false,
  progressBar = false,
  onPlaying,
  onEnded,
  onError,
}: Props) {
  const video = useRef<HTMLVideoElement>(null),
    audio = useRef<HTMLAudioElement>(null);
  const container = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const columns = usePortraitTiling(video, canvas, container, stream.video, settings.portraitColumns);
  const tiled = columns > 1;
  const [progress, setProgress] = useState({ time: 0, duration: 0, paused: false });
  const updateProgress = () => {
    const v = video.current;
    if (v && controls)
      setProgress({
        time: v.currentTime,
        duration: Number.isFinite(v.duration) ? v.duration : 0,
        paused: v.paused,
      });
  };
  useEffect(updateProgress, [controls, stream.video]);
  const callbacks = useRef({ onPlaying, onEnded, onError });
  callbacks.current = { onPlaying, onEnded, onError };
  const playAudio = () => {
    if (audio.current && !video.current?.paused)
      audio.current.play().catch((error) => {
        if (error.name !== 'AbortError' && settings.volume > 0) callbacks.current.onError?.();
      });
  };
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (paused) {
      v.pause();
      audio.current?.pause();
    } else
      v.play().catch((error) => {
        if (error.name !== 'AbortError') callbacks.current.onError?.();
      });
  }, [stream.video, paused]);
  useEffect(() => {
    for (const media of [video.current, audio.current])
      if (media) {
        media.volume = settings.volume / 100;
        media.muted = settings.volume === 0;
      }
  }, [settings.volume, stream.video]);
  useEffect(() => {
    const v = video.current,
      a = audio.current;
    return () => {
      v?.pause();
      a?.pause();
    };
  }, []);
  return (
    <div ref={container} className={`media-player ${tiled ? 'is-tiled' : ''}`} data-columns={columns}>
      <video
        ref={video}
        src={stream.video}
        controls={controls && !tiled}
        autoPlay={!paused}
        playsInline
        style={{ objectFit: settings.fit }}
        onPlaying={() => {
          updateProgress();
          playAudio();
          callbacks.current.onPlaying?.();
        }}
        onPause={() => {
          audio.current?.pause();
          updateProgress();
        }}
        onLoadedMetadata={updateProgress}
        onWaiting={() => audio.current?.pause()}
        onSeeking={() => {
          if (audio.current && video.current) audio.current.currentTime = video.current.currentTime;
        }}
        onSeeked={updateProgress}
        onTimeUpdate={() => {
          updateProgress();
          const a = audio.current,
            v = video.current;
          if (a && v && Math.abs(a.currentTime - v.currentTime) > 0.35) a.currentTime = v.currentTime;
        }}
        onVolumeChange={() => {
          const a = audio.current,
            v = video.current;
          if (a && v) {
            a.volume = v.volume;
            a.muted = v.muted;
          }
        }}
        onEnded={() => {
          audio.current?.pause();
          callbacks.current.onEnded?.();
        }}
        onError={() => callbacks.current.onError?.()}
      />
      <canvas ref={canvas} className="portrait-tiles" aria-hidden="true" />
      {progressBar && <WallpaperProgress video={video} source={stream.video} />}
      {tiled && controls && (
        <div className="tiled-controls">
          <button
            aria-label={progress.paused ? '继续预览' : '暂停预览'}
            onClick={() => {
              const v = video.current;
              if (!v) return;
              if (v.paused) void v.play().catch(() => callbacks.current.onError?.());
              else v.pause();
            }}
          >
            {progress.paused ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <input
            aria-label="预览播放进度"
            type="range"
            min={0}
            max={progress.duration || 1}
            step={0.1}
            value={progress.time}
            onChange={(e) => {
              if (video.current) video.current.currentTime = Number(e.target.value);
              updateProgress();
            }}
          />
          <span>{columns} 联屏</span>
        </div>
      )}
      {stream.audio && (
        <audio ref={audio} src={stream.audio} preload="auto" onError={() => callbacks.current.onError?.()} />
      )}
    </div>
  );
}
