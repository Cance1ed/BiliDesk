import { spawn } from 'node:child_process';
import electron from 'electron';
import path from 'node:path';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const packaged = process.argv.includes('--packaged');
const child = spawn(
  packaged
    ? path.resolve(
        process.env.BILIDESK_RELEASE_DIR || 'release',
        process.platform === 'darwin'
          ? `mac${process.arch === 'arm64' ? '-arm64' : ''}/BiliDesk.app/Contents/MacOS/BiliDesk`
          : 'win-unpacked/BiliDesk.exe',
      )
    : electron,
  [
    ...(packaged ? [] : ['.']),
    '--smoke-test',
    ...process.argv
      .filter((arg) => arg.startsWith('--startup='))
      .map((arg) => arg.replace('--startup=', '--smoke-startup=')),
    ...(process.argv.includes('--playback') ? ['--smoke-playback'] : []),
    ...(process.argv.includes('--subscriptions') ? ['--smoke-subscriptions'] : []),
    ...(process.argv.includes('--portrait') ? ['--smoke-portrait'] : []),
  ],
  { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});
child.stderr.on('data', (chunk) => process.stderr.write(chunk));
const timer = setTimeout(() => {
  child.kill();
  console.error('Desktop smoke test timed out');
  process.exitCode = 1;
}, 90000);
child.on('exit', (code) => {
  clearTimeout(timer);
  process.exitCode = code === 0 && output.includes('BILIDESK_SMOKE') ? 0 : 1;
});
