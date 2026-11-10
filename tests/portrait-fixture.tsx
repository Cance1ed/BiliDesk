import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { MediaPlayer } from '../src/MediaPlayer';
import '../src/styles.css';
function Fixture() {
  const [columns, setColumns] = useState(0),
    [paused, setPaused] = useState(false),
    [portrait, setPortrait] = useState(true);
  return (
    <div style={{ padding: 30, background: '#f1f3f8', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, marginBottom: 10 }}>竖屏视频 · 自动联屏</h1>
      <p style={{ fontSize: 13, marginBottom: 20 }}>原创测试视频 · 同一视频帧重复绘制，仅一个视频解码器</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <select aria-label="联屏模式" value={columns} onChange={(e) => setColumns(Number(e.target.value))}>
          <option value={0}>自动</option>
          <option value={-1}>关闭</option>
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {n} 联屏
            </option>
          ))}
        </select>
        <button className="button secondary small" onClick={() => setPaused((v) => !v)}>
          {paused ? '继续' : '暂停'}
        </button>
        <button className="button secondary small" onClick={() => setPortrait((v) => !v)}>
          {portrait ? '切换横屏视频' : '切换竖屏视频'}
        </button>
      </div>
      <div style={{ width: '100%', aspectRatio: '16/9', background: '#000' }}>
        <MediaPlayer
          key={portrait ? 'p' : 'l'}
          stream={{
            video: `/tests/fixtures/${portrait ? 'portrait' : 'landscape'}.webm`,
            audio: null,
            quality: 0,
          }}
          settings={{
            mode: 'single',
            displayId: 'primary',
            volume: 0,
            fit: 'cover',
            portraitColumns: columns,
            interval: 0,
            quality: 80,
            pauseOnBattery: true,
            launchAtLogin: false,
            autoPlayOnLaunch: true,
          }}
          paused={paused}
          controls
          onEnded={() => {
            const v = document.querySelector('video');
            if (v) {
              v.currentTime = 0;
              void v.play();
            }
          }}
        />
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
