import type { CoordinatorSnapshot } from "./core/wellness-coordinator";

export type MajorReminderKind = "gaze" | "movement-break";

export type SessionPresentation = {
  trayTitle: string;
  statusLabel: string;
  nextReminder: {
    kind: MajorReminderKind;
    label: string;
    remainingMs: number;
    remainingLabel: string;
  } | null;
};

function shortRemaining(milliseconds: number) {
  if (milliseconds <= 0) return "现在";
  return `${Math.max(1, Math.ceil(milliseconds / 60_000))}m`;
}

export function createSessionPresentation(snapshot: CoordinatorSnapshot): SessionPresentation {
  if (snapshot.status === "idle") {
    return { trayTitle: "舒 · 未开始", statusLabel: "准备好时再开始", nextReminder: null };
  }

  if (snapshot.status === "paused") {
    return { trayTitle: "舒 · 已暂停", statusLabel: "本轮已暂停", nextReminder: null };
  }

  const movementIsNext = snapshot.sedentaryRemainingMs <= snapshot.gazeRemainingMs;
  const nextReminder = movementIsNext
    ? {
        kind: "movement-break" as const,
        label: "起身",
        remainingMs: snapshot.sedentaryRemainingMs,
        remainingLabel: shortRemaining(snapshot.sedentaryRemainingMs),
      }
    : {
        kind: "gaze" as const,
        label: "远眺",
        remainingMs: snapshot.gazeRemainingMs,
        remainingLabel: shortRemaining(snapshot.gazeRemainingMs),
      };

  return {
    trayTitle: `舒 · ${nextReminder.label} ${nextReminder.remainingLabel}`,
    statusLabel: `下一次${nextReminder.label} ${nextReminder.remainingLabel}`,
    nextReminder,
  };
}
