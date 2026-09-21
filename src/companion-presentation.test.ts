import { describe, expect, it } from "vitest";

import { createCompanionPresentation } from "./companion-presentation";

const minute = 60_000;

describe("floating companion presentation", () => {
  it("turns a movement reminder into a clear end-of-round action", () => {
    expect(
      createCompanionPresentation({
        snapshot: {
          status: "working",
          sessionElapsedMs: 40 * minute,
          gazeRemainingMs: 0,
          sedentaryRemainingMs: 0,
        },
        reminder: { kind: "movement-break", durationSeconds: 120, includesGaze: true },
      }),
    ).toMatchObject({
      mode: "movement",
      expanded: true,
      title: "起来走走吧",
      primaryAction: "complete-reminder",
      primaryLabel: "我起来了，结束本轮",
      secondaryAction: "snooze-reminder",
    });
  });

  it("offers a gentle start action while no work round is active", () => {
    expect(
      createCompanionPresentation({
        snapshot: {
          status: "idle",
          sessionElapsedMs: 0,
          gazeRemainingMs: 20 * minute,
          sedentaryRemainingMs: 40 * minute,
        },
        reminder: null,
      }),
    ).toMatchObject({
      mode: "idle",
      expanded: false,
      title: "准备好时再开始",
      primaryAction: "start-work",
    });
  });

  it("turns a blink reminder into a visible but non-blocking cue", () => {
    expect(
      createCompanionPresentation({
        snapshot: {
          status: "working",
          sessionElapsedMs: 5 * minute,
          gazeRemainingMs: 15 * minute,
          sedentaryRemainingMs: 35 * minute,
        },
        reminder: { kind: "blink", autoDismissSeconds: 5 },
      }),
    ).toMatchObject({
      mode: "blink",
      expanded: false,
      attentionCue: "gentle-blink",
      hintLabel: "慢慢眨眼 5 次",
      primaryAction: null,
    });
  });
});
