import type { CoordinatorSnapshot, Reminder } from "./core/wellness-coordinator";
import { createSessionPresentation } from "./session-presentation";

export type CompanionAction =
  | "start-work"
  | "pause-work"
  | "resume-work"
  | "complete-reminder"
  | "snooze-reminder"
  | "open-main";

export type CompanionMode =
  | "idle"
  | "working"
  | "paused"
  | "blink"
  | "gaze"
  | "exercise"
  | "movement";

export type CompanionPresentation = {
  mode: CompanionMode;
  expanded: boolean;
  eyebrow: string;
  title: string;
  detail: string;
  primaryAction: CompanionAction | null;
  primaryLabel: string | null;
  secondaryAction: CompanionAction | null;
  secondaryLabel: string | null;
};

type CompanionInput = {
  snapshot: CoordinatorSnapshot;
  reminder: Reminder | null;
};

export function createCompanionPresentation({
  snapshot,
  reminder,
}: CompanionInput): CompanionPresentation {
  if (reminder?.kind === "movement-break") {
    return {
      mode: "movement",
      expanded: true,
      eyebrow: "这一轮已经很专注了",
      title: "起来走走吧",
      detail: reminder.includesGaze
        ? "离开座位活动几分钟，也顺便看看远处。完成后本轮会结束。"
        : "离开座位活动几分钟。完成后本轮会结束，准备好再开始下一轮。",
      primaryAction: "complete-reminder",
      primaryLabel: "我起来了，结束本轮",
      secondaryAction: "snooze-reminder",
      secondaryLabel: "5 分钟后提醒",
    };
  }

  if (reminder?.kind === "gaze") {
    return {
      mode: "gaze",
      expanded: true,
      eyebrow: "让眼睛松一口气",
      title: "看看远处 20 秒",
      detail: "找一个约 6 米以外的目标，放松视线和肩膀。",
      primaryAction: "complete-reminder",
      primaryLabel: "完成远眺",
      secondaryAction: "snooze-reminder",
      secondaryLabel: "5 分钟后提醒",
    };
  }

  if (reminder?.kind === "micro-exercise") {
    return {
      mode: "exercise",
      expanded: true,
      eyebrow: "轻轻活动两分钟",
      title: "让下肢动起来",
      detail: "舒适地做一组提踵或踮脚；如有不适，请立即停止。",
      primaryAction: "complete-reminder",
      primaryLabel: "完成运动",
      secondaryAction: "snooze-reminder",
      secondaryLabel: "稍后提醒",
    };
  }

  if (reminder?.kind === "blink") {
    return {
      mode: "blink",
      expanded: false,
      eyebrow: "轻提醒",
      title: "慢慢眨眼几次",
      detail: "完整眨眼 5 次，放松眼周。",
      primaryAction: null,
      primaryLabel: null,
      secondaryAction: null,
      secondaryLabel: null,
    };
  }

  if (snapshot.status === "idle") {
    return {
      mode: "idle",
      expanded: false,
      eyebrow: "舒展一下",
      title: "准备好时再开始",
      detail: "我会安静地陪你安排眨眼、远眺和活动。",
      primaryAction: "start-work",
      primaryLabel: "开始工作",
      secondaryAction: "open-main",
      secondaryLabel: "打开主界面",
    };
  }

  if (snapshot.status === "paused") {
    return {
      mode: "paused",
      expanded: false,
      eyebrow: "已经暂停",
      title: "休息多久都可以",
      detail: "准备好后再继续，本轮进度还在。",
      primaryAction: "resume-work",
      primaryLabel: "继续工作",
      secondaryAction: "open-main",
      secondaryLabel: "打开主界面",
    };
  }

  const session = createSessionPresentation(snapshot);
  return {
    mode: "working",
    expanded: false,
    eyebrow: "专注中",
    title: session.statusLabel,
    detail: "自然呼吸，肩膀放松一点。",
    primaryAction: "pause-work",
    primaryLabel: "暂停",
    secondaryAction: "open-main",
    secondaryLabel: "打开主界面",
  };
}
