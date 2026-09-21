import { describe, expect, it } from "vitest";

import { createSessionPresentation } from "./session-presentation";

describe("session presentation", () => {
  it("shows the nearest major reminder in the menu bar", () => {
    expect(
      createSessionPresentation({
        status: "working",
        sessionElapsedMs: 10 * 60_000,
        gazeRemainingMs: 12 * 60_000,
        sedentaryRemainingMs: 4 * 60_000,
      }).trayTitle,
    ).toBe("舒 · 起身 4m");

    expect(
      createSessionPresentation({
        status: "working",
        sessionElapsedMs: 10 * 60_000,
        gazeRemainingMs: 3 * 60_000,
        sedentaryRemainingMs: 20 * 60_000,
      }).trayTitle,
    ).toBe("舒 · 远眺 3m");
  });

  it("uses calm status labels while idle or paused", () => {
    expect(
      createSessionPresentation({
        status: "idle",
        sessionElapsedMs: 0,
        gazeRemainingMs: 20 * 60_000,
        sedentaryRemainingMs: 40 * 60_000,
      }).trayTitle,
    ).toBe("舒 · 未开始");

    expect(
      createSessionPresentation({
        status: "paused",
        sessionElapsedMs: 8 * 60_000,
        gazeRemainingMs: 12 * 60_000,
        sedentaryRemainingMs: 32 * 60_000,
      }).trayTitle,
    ).toBe("舒 · 已暂停");
  });
});
