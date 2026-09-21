export type PointerPoint = { x: number; y: number };

export function shouldStartWindowDrag(
  origin: PointerPoint,
  current: PointerPoint,
  threshold = 4,
) {
  return Math.hypot(current.x - origin.x, current.y - origin.y) >= threshold;
}
