// Subtract opaque window rectangles from the target monitor's usable desktop.
// A one-pixel inset absorbs native border rounding, without treating partial coverage as hidden.
function desktopCovered(area, windows) {
  if (!area || area.width <= 2 || area.height <= 2) return false;
  let uncovered = [
    { left: area.x + 1, top: area.y + 1, right: area.x + area.width - 1, bottom: area.y + area.height - 1 },
  ];
  for (const window of windows) {
    if (![window.x, window.y, window.width, window.height].every(Number.isFinite)) continue;
    const next = [];
    for (const part of uncovered) {
      const left = Math.max(part.left, window.x),
        top = Math.max(part.top, window.y);
      const right = Math.min(part.right, window.x + window.width),
        bottom = Math.min(part.bottom, window.y + window.height);
      if (right <= left || bottom <= top) {
        next.push(part);
        continue;
      }
      if (part.top < top) next.push({ ...part, bottom: top });
      if (part.bottom > bottom) next.push({ ...part, top: bottom });
      if (part.left < left) next.push({ left: part.left, right: left, top, bottom });
      if (part.right > right) next.push({ left: right, right: part.right, top, bottom });
    }
    uncovered = next;
    if (!uncovered.length) return true;
    // Bound work for unusual window arrangements; an uncertain result keeps playback available.
    if (uncovered.length > 1024) return false;
  }
  return false;
}
module.exports = { desktopCovered };
