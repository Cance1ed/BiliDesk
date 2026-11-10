const { desktopCovered } = require('./visibility-geometry.cjs');
let windows, mac;
function windowsApi() {
  if (windows) return windows;
  const koffi = require('koffi'),
    user = koffi.load('user32.dll'),
    dwm = koffi.load('dwmapi.dll');
  const callback = koffi.proto('bool __stdcall BiliVisibilityEnum(uintptr_t hwnd, intptr_t data)');
  windows = {
    koffi,
    callback,
    enumerate: user.func('bool __stdcall EnumWindows(BiliVisibilityEnum *callback, intptr_t data)'),
    visible: user.func('bool __stdcall IsWindowVisible(uintptr_t hwnd)'),
    iconic: user.func('bool __stdcall IsIconic(uintptr_t hwnd)'),
    className: user.func('int __stdcall GetClassNameW(uintptr_t hwnd, void *name, int length)'),
    rect: user.func('bool __stdcall GetWindowRect(uintptr_t hwnd, void *rect)'),
    style: user.func('intptr_t __stdcall GetWindowLongPtrW(uintptr_t hwnd, int index)'),
    layered: user.func(
      'bool __stdcall GetLayeredWindowAttributes(uintptr_t hwnd, void *key, void *alpha, void *flags)',
    ),
    attribute: dwm.func(
      'long __stdcall DwmGetWindowAttribute(uintptr_t hwnd, uint attribute, void *value, uint size)',
    ),
  };
  return windows;
}
function cloaked(api, handle) {
  const value = Buffer.alloc(4);
  return api.attribute(handle, 14, value, 4) === 0 && value.readUInt32LE() !== 0;
}
function windowsSnapshot(win) {
  const api = windowsApi(),
    handle = win.getNativeWindowHandle().readBigUInt64LE();
  const hidden = !api.visible(handle) || api.iconic(handle) || cloaked(api, handle);
  const rectangles = [];
  let error;
  const cb = api.koffi.register((hwnd) => {
    try {
      if (BigInt(hwnd) === handle || !api.visible(hwnd) || api.iconic(hwnd) || cloaked(api, hwnd))
        return true;
      const name = Buffer.alloc(512);
      const length = api.className(hwnd, name, 256);
      if (
        ['Progman', 'WorkerW', 'SHELLDLL_DefView', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd'].includes(
          name.toString('utf16le', 0, length * 2),
        )
      )
        return true;
      const style = BigInt(api.style(hwnd, -20));
      if (style & 0x80000n) {
        const alpha = Buffer.alloc(1),
          flags = Buffer.alloc(4),
          key = Buffer.alloc(4);
        if (!api.layered(hwnd, key, alpha, flags) || flags.readUInt32LE() !== 2 || alpha[0] !== 255)
          return true;
      }
      const rect = Buffer.alloc(16);
      if (api.attribute(hwnd, 9, rect, 16) !== 0 && !api.rect(hwnd, rect)) return true;
      rectangles.push({
        id: String(hwnd),
        x: rect.readInt32LE(0),
        y: rect.readInt32LE(4),
        width: rect.readInt32LE(8) - rect.readInt32LE(0),
        height: rect.readInt32LE(12) - rect.readInt32LE(4),
      });
      return true;
    } catch (caught) {
      error = caught;
      return false;
    }
  }, api.koffi.pointer(api.callback));
  try {
    api.enumerate(cb, 0);
  } finally {
    api.koffi.unregister(cb);
  }
  if (error) throw error;
  return { hidden, rectangles };
}
function macApi() {
  if (mac) return mac;
  const koffi = require('koffi');
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
  const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
  const point = koffi.struct('BiliVisibilityPoint', { x: 'double', y: 'double' });
  const size = koffi.struct('BiliVisibilitySize', { width: 'double', height: 'double' });
  const rect = koffi.struct('BiliVisibilityRect', { origin: point, size });
  const string = cf.func(
    'void *CFStringCreateWithCString(void *allocator, const char *value, uint32 encoding)',
  );
  mac = {
    selector: objc.func('void *sel_registerName(const char *name)'),
    object: objc.func('objc_msgSend', 'void *', ['void *', 'void *']),
    integer: objc.func('objc_msgSend', 'long', ['void *', 'void *']),
    boolean: objc.func('objc_msgSend', 'bool', ['void *', 'void *']),
    list: cg.func('void *CGWindowListCopyWindowInfo(uint32 options, uint32 relative)'),
    count: cf.func('long CFArrayGetCount(void *array)'),
    at: cf.func('void *CFArrayGetValueAtIndex(void *array, long index)'),
    get: cf.func('void *CFDictionaryGetValue(void *dictionary, void *key)'),
    number: cf.func('bool CFNumberGetValue(void *number, int type, _Out_ double *value)'),
    rect: cg.func('CGRectMakeWithDictionaryRepresentation', 'bool', [
      'void *',
      koffi.out(koffi.pointer(rect)),
    ]),
    release: cf.func('void CFRelease(void *object)'),
    // Static keys only. No window titles, screenshots or accessibility access are requested.
    keys: Object.fromEntries(
      ['kCGWindowBounds', 'kCGWindowAlpha', 'kCGWindowLayer', 'kCGWindowNumber'].map((key) => [
        key,
        string(null, key, 0x08000100),
      ]),
    ),
  };
  return mac;
}
function macSnapshot(win) {
  const api = macApi(),
    native = api.object(win.getNativeWindowHandle().readBigUInt64LE(), api.selector('window'));
  if (!native) throw new Error('无法读取桌面窗口');
  const ownId = Number(api.integer(native, api.selector('windowNumber')));
  const hidden =
    !api.boolean(native, api.selector('isOnActiveSpace')) ||
    !(Number(api.integer(native, api.selector('occlusionState'))) & 2);
  const list = api.list(1 | 16, 0); // Onscreen only, excluding desktop elements.
  if (!list) throw new Error('无法读取窗口可见性');
  const rectangles = [];
  const number = (entry, key) => {
    const value = api.get(entry, api.keys[key]),
      result = [0];
    return value && api.number(value, 13, result) ? result[0] : NaN;
  };
  try {
    for (let i = 0; i < api.count(list); i++) {
      const entry = api.at(list, i),
        id = number(entry, 'kCGWindowNumber');
      if (
        id === ownId ||
        !(number(entry, 'kCGWindowAlpha') >= 0.99) ||
        !(number(entry, 'kCGWindowLayer') >= 0)
      )
        continue;
      const bounds = api.get(entry, api.keys.kCGWindowBounds),
        rect = {};
      if (bounds && api.rect(bounds, rect))
        rectangles.push({
          id: String(id),
          x: rect.origin.x,
          y: rect.origin.y,
          width: rect.size.width,
          height: rect.size.height,
        });
    }
  } finally {
    api.release(list);
  }
  return { hidden, rectangles };
}
function desktopVisibilitySnapshot(win) {
  if (process.platform === 'win32') return windowsSnapshot(win);
  if (process.platform === 'darwin') return macSnapshot(win);
  return { hidden: false, rectangles: [] };
}
function isDesktopHidden(win, workArea) {
  const { hidden, rectangles } = desktopVisibilitySnapshot(win);
  return hidden || desktopCovered(workArea, rectangles);
}
module.exports = { isDesktopHidden, desktopVisibilitySnapshot };
