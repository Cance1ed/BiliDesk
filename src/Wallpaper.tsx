import { useEffect, useState } from 'react';
import type { WallpaperCommand } from './types';
import { MediaPlayer } from './MediaPlayer';
export default function Wallpaper() {
  const [current, setCurrent] = useState<WallpaperCommand | null>(null),
    [paused, setPaused] = useState(false);
  useEffect(() => {
    const receive = (command: WallpaperCommand) => {
      if (command.type === 'load') {
        setCurrent(command);
        setPaused(command.paused ?? false);
      }
      if (command.type === 'settings')
        setCurrent((old) => (old ? { ...old, settings: command.settings } : old));
      if (command.type === 'pause') setPaused(true);
      if (command.type === 'resume') setPaused(false);
    };
    const off = window.wallpaper?.onCommand(receive);
    window.wallpaper?.ready().then((command) => {
      if (command) receive(command);
    });
    return off;
  }, []);
  const report = (type: string) => window.wallpaper?.report(type, current?.generation || 0);
  return (
    <div className="wallpaper-canvas">
      {current?.stream && current.settings && (
        <MediaPlayer
          key={current.generation}
          stream={current.stream}
          settings={current.settings}
          paused={paused}
          progressBar={current.settings.showProgressBar}
          onPlaying={() => report('playing')}
          onEnded={() => report('ended')}
          onError={() => report('error')}
        />
      )}
    </div>
  );
}
