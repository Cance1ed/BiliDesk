const test = require('node:test');
const assert = require('node:assert/strict');
const { desktopCovered } = require('../electron/visibility-geometry.cjs');
const area = { x: 0, y: 0, width: 1920, height: 1040 };
test('maximized and fullscreen bounds cover the usable desktop while partial windows do not', () => {
  assert.equal(desktopCovered(area, [area]), true);
  assert.equal(desktopCovered(area, [{ x: -8, y: -8, width: 1936, height: 1088 }]), true);
  assert.equal(desktopCovered(area, [{ x: 0, y: 0, width: 1800, height: 1040 }]), false);
  assert.equal(desktopCovered(area, []), false);
});
test('several snapped windows count as coverage but overlapping windows and gaps do not', () => {
  const left = { x: 0, y: 0, width: 960, height: 1040 };
  assert.equal(desktopCovered(area, [left, { ...left, x: 960 }]), true);
  assert.equal(desktopCovered(area, [left, { ...left, x: 950 }]), false);
  assert.equal(desktopCovered(area, [left, { ...left, x: 965 }]), false);
  assert.equal(desktopCovered(area, [left, left]), false);
});
test('only target monitor coverage matters, including negative coordinates and physical DPI sizes', () => {
  const second = { x: -2560, y: -100, width: 2560, height: 1400 };
  assert.equal(desktopCovered(second, [area]), false);
  assert.equal(desktopCovered(second, [second]), true);
  assert.equal(
    desktopCovered(second, [
      { ...second, width: 1280 },
      { ...second, x: -1280, width: 1280 },
    ]),
    true,
  );
  assert.equal(desktopCovered(second, [{ ...second, width: 1920 }]), false);
});
test('invalid rectangles and empty work areas fail open', () => {
  assert.equal(
    desktopCovered(area, [
      { ...area, x: NaN },
      { ...area, width: -1 },
    ]),
    false,
  );
  assert.equal(desktopCovered({ ...area, width: 0 }, [area]), false);
});
