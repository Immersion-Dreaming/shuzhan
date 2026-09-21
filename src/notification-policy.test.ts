import { describe, expect, it } from "vitest";

import { chooseReminderPresentation } from "./notification-policy";

describe("reminder presentation policy", () => {
  it("uses a quiet system notification for blink reminders while the app is in the background", () => {
    expect(
      chooseReminderPresentation({ kind: "blink", autoDismissSeconds: 5 }, false),
    ).toMatchObject({
      surface: "system",
      urgency: "quiet",
      title: "慢慢眨眼几次",
    });
  });

  it("keeps blink reminders inside the app while the window is focused", () => {
    expect(
      chooseReminderPresentation({ kind: "blink", autoDismissSeconds: 5 }, true),
    ).toMatchObject({
      surface: "in-app",
      urgency: "quiet",
    });
  });
});
