const test = require('node:test');
const assert = require('node:assert/strict');
const layout = import('../src/portrait-layout.mjs');
test('portrait videos choose three columns on 16:9 and four on ultrawide', async () => {
  const { portraitLayout } = await layout;
  assert.equal(portraitLayout(2560, 1440, 1080, 1920).columns, 3);
  assert.equal(portraitLayout(3440, 1440, 1080, 1920).columns, 4);
  assert.equal(portraitLayout(1080, 1920, 1080, 1920).columns, 1);
});
test('landscape, square, disabled tiling and missing metadata preserve ordinary playback', async () => {
  const { portraitLayout } = await layout;
  assert.equal(portraitLayout(2560, 1440, 1920, 1080, 3).columns, 1);
  assert.equal(portraitLayout(2560, 1440, 1080, 1080, 3).columns, 1);
  assert.equal(portraitLayout(2560, 1440, 1080, 1920, -1).columns, 1);
  assert.equal(portraitLayout(2560, 1440, 0, 0), null);
});
test('all columns cover every physical pixel with no gaps and preserve aspect ratio', async () => {
  const { portraitLayout } = await layout;
  for (const width of [1365, 1920, 2560, 3840])
    for (const count of [0, 2, 3, 4, 5, 6, 7, 8]) {
      const result = portraitLayout(width, 1080, 1080, 1920, count);
      let end = 0;
      for (const cell of result.cells) {
        assert.equal(cell.x, end);
        end += cell.width;
        assert.ok(Math.abs(cell.sw / cell.sh - cell.width / 1080) < 1e-8);
        assert.ok(cell.sx >= 0 && cell.sy >= 0 && cell.sw <= 1080 && cell.sh <= 1920);
      }
      assert.equal(end, width);
    }
});
