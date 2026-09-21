export type PointerPoint = { x: number; y: number };
export type CompanionWindowMode = "compact" | "blink" | "expanded";

const compactWidth = 76;
const blinkCueWidth = 250;

export function shouldStartWindowDrag(
  origin: PointerPoint,
  current: PointerPoint,
  threshold = 4,
) {
  return Math.hypot(current.x - origin.x, current.y - origin.y) >= threshold;
}

export function compactAnchorAfterMove(
  windowPosition: PointerPoint,
  mode: CompanionWindowMode,
  scaleFactor: number,
): PointerPoint {
  const horizontalOffset = mode === "blink" ? (blinkCueWidth - compactWidth) * scaleFactor : 0;
  return {
    x: Math.round(windowPosition.x + horizontalOffset),
    y: windowPosition.y,
  };
}
