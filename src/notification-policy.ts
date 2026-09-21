import type { Reminder } from "./core/wellness-coordinator";

export type ReminderPresentation = {
  surface: "in-app" | "system";
  urgency: "quiet" | "normal" | "prominent";
  title: string;
  body: string;
};

export function chooseReminderPresentation(
  reminder: Reminder,
  windowFocused: boolean,
): ReminderPresentation {
  const surface = windowFocused ? "in-app" : "system";

  if (reminder.kind === "blink") {
    return {
      surface,
      urgency: "quiet",
      title: "慢慢眨眼几次",
      body: "放松眼周，完整眨眼 5 次。",
    };
  }

  if (reminder.kind === "gaze") {
    return {
      surface,
      urgency: "normal",
      title: "看看远处 20 秒",
      body: "选择约 6 米以外的目标，让眼睛从近距离工作中缓一缓。",
    };
  }

  if (reminder.kind === "movement-break") {
    return {
      surface,
      urgency: "prominent",
      title: "起来走走吧",
      body: reminder.includesGaze
        ? "活动 2–5 分钟，同时看看远处。"
        : "离开座位活动 2–5 分钟，喝口水、伸展一下都很好。",
    };
  }

  return {
    surface,
    urgency: "normal",
    title: "用两分钟活动一下",
    body: "踮脚、提踵，再按自己的情况进行一组提肛练习。",
  };
}
