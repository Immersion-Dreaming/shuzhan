import { describe, expect, it } from "vitest";

import { compactAnchorAfterMove, shouldStartWindowDrag } from "./companion-drag";

describe("companion drag gesture", () => {
  it("keeps a steady press available for opening the companion", () => {
    expect(shouldStartWindowDrag({ x: 20, y: 20 }, { x: 22, y: 22 })).toBe(false);
  });

  it("starts a native window drag after deliberate pointer movement", () => {
    expect(shouldStartWindowDrag({ x: 20, y: 20 }, { x: 25, y: 20 })).toBe(true);
  });

  it("keeps the orb anchored after dragging the wider blink cue", () => {
    expect(compactAnchorAfterMove({ x: 100, y: 80 }, "blink", 2)).toEqual({
      x: 448,
      y: 80,
    });
  });
});
