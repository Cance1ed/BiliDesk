export function portraitLayout(
  width: number,
  height: number,
  videoWidth: number,
  videoHeight: number,
  preference?: number,
): {
  columns: number;
  cells: { x: number; width: number; sx: number; sy: number; sw: number; sh: number }[];
} | null;
