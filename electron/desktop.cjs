// Only this module crosses the native desktop boundary. No shell commands or helper processes.
let winApi;
function windowsApi() {
  if (winApi) return winApi;
  const koffi = require('koffi');
  const user = koffi.load('user32.dll');
  const kernel = koffi.load('kernel32.dll');
  const point = koffi.struct('BiliPoint', { x: 'int32', y: 'int32' });
  const rect = koffi.struct('BiliRect', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  const callback = koffi.proto('bool __stdcall BiliEnumWindows(uintptr_t hwnd, intptr_t data)');
  winApi = {
    koffi,
    callback,
    find: user.func('uintptr_t __stdcall FindWindowW(str16 className, str16 title)'),
    findEx: user.func(
      'uintptr_t __stdcall FindWindowExW(uintptr_t parent, uintptr_t after, str16 className, str16 title)',
    ),
    enumerate: user.func('bool __stdcall EnumWindows(BiliEnumWindows *callback, intptr_t data)'),
    send: user.func(
      'intptr_t __stdcall SendMessageTimeoutW(uintptr_t hwnd, uint msg, uintptr_t wparam, intptr_t lparam, uint flags, uint timeout, _Out_ uintptr_t *result)',
    ),
    getStyle: user.func('intptr_t __stdcall GetWindowLongPtrW(uintptr_t hwnd, int index)'),
    setStyle: user.func('intptr_t __stdcall SetWindowLongPtrW(uintptr_t hwnd, int index, intptr_t value)'),
    parent: user.func('uintptr_t __stdcall SetParent(uintptr_t child, uintptr_t parent)'),
    position: user.func(
      'bool __stdcall SetWindowPos(uintptr_t hwnd, uintptr_t after, int x, int y, int cx, int cy, uint flags)',
    ),
    map: user.func('MapWindowPoints', 'int', [
      'uintptr_t',
      'uintptr_t',
      koffi.inout(koffi.pointer(point)),
      'uint',
    ]),
    valid: user.func('bool __stdcall IsWindow(uintptr_t hwnd)'),
    clientRect: user.func('GetClientRect', 'bool', ['uintptr_t', koffi.out(koffi.pointer(rect))]),
    windowRect: user.func('GetWindowRect', 'bool', ['uintptr_t', koffi.out(koffi.pointer(rect))]),
    setError: kernel.func('void __stdcall SetLastError(uint error)'),
    getError: kernel.func('uint __stdcall GetLastError()'),
  };
  return winApi;
}
function attachWindows(win, physicalBounds) {
  const api = windowsApi();
  const handle = win.getNativeWindowHandle().readBigUInt64LE();
  const progman = api.find('Progman', null);
  if (!progman) throw new Error('未找到 Windows 桌面，请确认资源管理器正在运行');
  api.send(progman, 0x052c, 0x0d, 0, 2, 1000, [0]);
  api.send(progman, 0x052c, 0x0d, 1, 2, 1000, [0]);
  let worker = 0;
  const cb = api.koffi.register((hwnd) => {
    if (api.findEx(hwnd, 0, 'SHELLDLL_DefView', null)) worker = api.findEx(0, hwnd, 'WorkerW', null);
    return true;
  }, api.koffi.pointer(api.callback));
  try {
    api.enumerate(cb, 0);
  } finally {
    api.koffi.unregister(cb);
  }
  // Newer Explorer versions can host WorkerW under Progman.
  if (!worker) worker = api.findEx(progman, 0, 'WorkerW', null);
  if (!worker) throw new Error('无法连接 Windows 桌面层；请重启资源管理器后重试');
  const style = BigInt(api.getStyle(handle, -16));
  // SetParent keeps non-client decorations. WS_CAPTION includes WS_BORDER;
  // leaving it set costs 8 physical pixels on each side even with frame:false.
  const decorations = 0x80000000n | 0x00c00000n | 0x00040000n | 0x00080000n | 0x00030000n;
  api.setStyle(handle, -16, (style & ~decorations) | 0x40000000n);
  const extended = BigInt(api.getStyle(handle, -20));
  api.setStyle(handle, -20, extended & ~(0x00000100n | 0x00000200n | 0x00020000n | 0x00000001n));
  api.setError(0);
  api.parent(handle, worker);
  const error = api.getError();
  if (error) throw new Error(`桌面挂载失败（Windows ${error}）`);
  const origin = { x: physicalBounds.x, y: physicalBounds.y };
  api.map(0, worker, origin, 1);
  if (
    !api.position(
      handle,
      0,
      origin.x,
      origin.y,
      physicalBounds.width,
      physicalBounds.height,
      0x0010 | 0x0020 | 0x0040,
    )
  )
    throw new Error('无法设置壁纸窗口大小');
  return () => api.valid(worker);
}
// CGWindowLevelKey values from CoreGraphics/CGWindowLevel.h.
const kCGDesktopWindowLevelKey = 2;
const kCGDesktopIconWindowLevelKey = 18;
let macApi;
function macosApi() {
  if (macApi) return macApi;
  const koffi = require('koffi');
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  const graphics = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
  macApi = {
    selector: objc.func('void *sel_registerName(const char *name)'),
    getWindow: objc.func('objc_msgSend', 'void *', ['void *', 'void *']),
    getLevel: objc.func('objc_msgSend', 'long', ['void *', 'void *']),
    setLevel: objc.func('objc_msgSend', 'void', ['void *', 'void *', 'long']),
    level: graphics.func('int32 CGWindowLevelForKey(int key)'),
  };
  return macApi;
}
function macWindow(win) {
  const api = macosApi();
  const window = api.getWindow(win.getNativeWindowHandle().readBigUInt64LE(), api.selector('window'));
  if (!window) throw new Error('无法取得 macOS 桌面窗口');
  return { api, window };
}
function attachMac(win) {
  const { api, window } = macWindow(win);
  // Above the static wallpaper, below Finder's desktop icons.
  api.setLevel(window, api.selector('setLevel:'), api.level(kCGDesktopWindowLevelKey) + 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false, skipTransformProcessType: true });
  return () => true;
}
function attachDesktop(win, physicalBounds) {
  if (process.platform === 'win32') return attachWindows(win, physicalBounds);
  if (process.platform === 'darwin') return attachMac(win);
  throw new Error('动态壁纸目前支持 Windows 和 macOS');
}
function inspectDesktopBounds(win) {
  if (process.platform === 'darwin') {
    const { api, window } = macWindow(win);
    return {
      level: Number(api.getLevel(window, api.selector('level'))),
      desktopLevel: api.level(kCGDesktopWindowLevelKey),
      iconLevel: api.level(kCGDesktopIconWindowLevelKey),
    };
  }
  if (process.platform !== 'win32') return null;
  const api = windowsApi(),
    handle = win.getNativeWindowHandle().readBigUInt64LE();
  const client = {},
    outer = {},
    origin = { x: 0, y: 0 };
  if (!api.clientRect(handle, client) || !api.windowRect(handle, outer))
    throw new Error('无法读取壁纸窗口边界');
  api.map(handle, 0, origin, 1);
  return {
    client: {
      x: origin.x,
      y: origin.y,
      width: client.right - client.left,
      height: client.bottom - client.top,
    },
    outer,
    style: BigInt(api.getStyle(handle, -16)).toString(16),
    extendedStyle: BigInt(api.getStyle(handle, -20)).toString(16),
  };
}
module.exports = { attachDesktop, inspectDesktopBounds };
