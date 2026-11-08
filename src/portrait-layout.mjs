/** Repeat a portrait frame across equal, gap-free columns without stretching it. */
export function portraitLayout(width, height, videoWidth, videoHeight, preference = 0) {
  if (![width, height, videoWidth, videoHeight].every((v) => Number.isFinite(v) && v > 0)) return null;
  const portrait = videoHeight > videoWidth;
  const columns =
    !portrait || preference === -1
      ? 1
      : preference >= 2
        ? Math.min(8, Math.floor(preference))
        : Math.max(1, Math.min(12, Math.round(width / height / (videoWidth / videoHeight))));
  const cells = Array.from({ length: columns }, (_, index) => {
    const x = Math.round((index * width) / columns),
      right = Math.round(((index + 1) * width) / columns);
    const cellWidth = right - x,
      scale = Math.max(cellWidth / videoWidth, height / videoHeight);
    const sw = cellWidth / scale,
      sh = height / scale;
    return { x, width: cellWidth, sx: (videoWidth - sw) / 2, sy: (videoHeight - sh) / 2, sw, sh };
  });
  return { columns, cells };
}
