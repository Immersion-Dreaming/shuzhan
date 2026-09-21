export type Reminder =
  | {
      kind: "gaze";
      durationSeconds: 20;
    }
  | {
      kind: "movement-break";
      durationSeconds: 120;
      includesGaze: boolean;
    }
  | {
      kind: "blink";
      autoDismissSeconds: 5;
    }
  | {
      kind: "micro-exercise";
      durationSeconds: 120;
      period: WorkPeriod;
    };

export type WorkPeriod = "morning" | "afternoon" | "evening";

export type WellnessEvent =
  | { type: "start-work"; at: number }
  | { type: "pause-work"; at: number }
  | { type: "resume-work"; at: number }
  | { type: "end-work"; at: number }
  | { type: "system-sleep"; at: number }
  | { type: "system-wake"; at: number }
  | { type: "complete-reminder"; at: number }
  | { type: "snooze-reminder"; at: number }
  | { type: "time-passed"; at: number };

export type CoordinatorResult = {
  reminder: Reminder | null;
  snapshot: CoordinatorSnapshot;
  checkpoint: CoordinatorCheckpoint;
};

export type SessionStatus = "idle" | "working" | "paused";

export type CoordinatorSnapshot = {
  status: SessionStatus;
  sessionElapsedMs: number;
  gazeRemainingMs: number;
  sedentaryRemainingMs: number;
};

export type CoordinatorCheckpoint = {
  version: 1;
  status: SessionStatus;
  savedAt: number;
  sessionElapsedMs: number;
  gazeElapsedMs: number;
  sedentaryElapsedMs: number;
  blinkElapsedMs: number;
  blinkTargetMs: number;
  exerciseElapsedByPeriod: Array<[string, number]>;
  completedExercisePeriods: string[];
};

export type WellnessCoordinator = {
  dispatch(event: WellnessEvent): CoordinatorResult;
};

const reminderGuardWindowMs = 2 * 60_000;

export type CoordinatorOptions = {
  blinkEnabled?: boolean;
  exerciseEnabled?: boolean;
  gazeIntervalMinutes?: number;
  sedentaryIntervalMinutes?: number;
  blinkMinimumMinutes?: number;
  blinkMaximumMinutes?: number;
  exerciseAfterMinutes?: number;
  random?: () => number;
  checkpoint?: CoordinatorCheckpoint;
};

export function createWellnessCoordinator(options: CoordinatorOptions = {}): WellnessCoordinator {
  const blinkEnabled = options.blinkEnabled ?? true;
  const exerciseEnabled = options.exerciseEnabled ?? true;
  const random = options.random ?? Math.random;
  const gazeIntervalMs = Math.max(1, options.gazeIntervalMinutes ?? 20) * 60_000;
  const sedentaryIntervalMs = Math.max(1, options.sedentaryIntervalMinutes ?? 40) * 60_000;
  const blinkMinimumMs = Math.max(1, options.blinkMinimumMinutes ?? 3) * 60_000;
  const blinkMaximumMs = Math.max(
    blinkMinimumMs,
    Math.max(1, options.blinkMaximumMinutes ?? 7) * 60_000,
  );
  const blinkRangeMs = blinkMaximumMs - blinkMinimumMs;
  const exerciseAfterMs = Math.max(1, options.exerciseAfterMinutes ?? 30) * 60_000;
  const checkpoint = options.checkpoint;
  let status: SessionStatus = checkpoint
    ? checkpoint.status === "idle"
      ? "idle"
      : "paused"
    : "idle";
  let statusBeforeSleep: SessionStatus = status;
  let lastUpdatedAt = checkpoint?.savedAt ?? 0;
  let gazeElapsedMs = checkpoint?.gazeElapsedMs ?? 0;
  let sedentaryElapsedMs = checkpoint?.sedentaryElapsedMs ?? 0;
  let sessionElapsedMs = checkpoint?.sessionElapsedMs ?? 0;
  let blinkElapsedMs = checkpoint?.blinkElapsedMs ?? 0;
  let blinkTargetMs = checkpoint?.blinkTargetMs ?? nextBlinkTarget();
  let activeReminder: Reminder | null = null;
  let snoozedReminder: Reminder | null = null;
  let snoozedUntil: number | null = null;
  const exerciseElapsedByPeriod = new Map<string, number>(checkpoint?.exerciseElapsedByPeriod ?? []);
  const completedExercisePeriods = new Set<string>(checkpoint?.completedExercisePeriods ?? []);

  function nextBlinkTarget() {
    return blinkMinimumMs + Math.floor(random() * blinkRangeMs);
  }

  function periodAt(at: number): { key: string; period: WorkPeriod } | null {
    const date = new Date(at);
    const hour = date.getHours();
    const period =
      hour >= 8 && hour < 12
        ? "morning"
        : hour >= 13 && hour < 18
          ? "afternoon"
          : hour >= 18 && hour < 23
            ? "evening"
            : null;

    if (period === null) return null;

    const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    return { key: `${day}:${period}`, period };
  }

  function advanceTime(at: number) {
    if (status === "working") {
      const elapsed = Math.max(0, at - lastUpdatedAt);
      gazeElapsedMs += elapsed;
      sedentaryElapsedMs += elapsed;
      sessionElapsedMs += elapsed;
      blinkElapsedMs += elapsed;
      const previousPeriod = periodAt(lastUpdatedAt);
      const currentPeriod = periodAt(at);
      if (previousPeriod?.key === currentPeriod?.key && currentPeriod) {
        exerciseElapsedByPeriod.set(
          currentPeriod.key,
          (exerciseElapsedByPeriod.get(currentPeriod.key) ?? 0) + elapsed,
        );
      }
    }
    lastUpdatedAt = at;
  }

  function result(reminder: Reminder | null = activeReminder): CoordinatorResult {
    return {
      reminder,
      snapshot: {
        status,
        sessionElapsedMs,
        gazeRemainingMs: Math.max(0, gazeIntervalMs - gazeElapsedMs),
        sedentaryRemainingMs: Math.max(0, sedentaryIntervalMs - sedentaryElapsedMs),
      },
      checkpoint: {
        version: 1,
        status,
        savedAt: lastUpdatedAt,
        sessionElapsedMs,
        gazeElapsedMs,
        sedentaryElapsedMs,
        blinkElapsedMs,
        blinkTargetMs,
        exerciseElapsedByPeriod: [...exerciseElapsedByPeriod.entries()],
        completedExercisePeriods: [...completedExercisePeriods],
      },
    };
  }

  return {
    dispatch(event) {
      if (event.type === "start-work") {
        status = "working";
        lastUpdatedAt = event.at;
        gazeElapsedMs = 0;
        sedentaryElapsedMs = 0;
        sessionElapsedMs = 0;
        blinkElapsedMs = 0;
        blinkTargetMs = nextBlinkTarget();
        activeReminder = null;
        snoozedReminder = null;
        snoozedUntil = null;
        return result(null);
      }

      advanceTime(event.at);

      if (event.type === "pause-work") {
        status = "paused";
        return result(null);
      }

      if (event.type === "resume-work") {
        status = "working";
        return result(null);
      }

      if (event.type === "system-sleep") {
        statusBeforeSleep = status;
        if (status === "working") status = "paused";
        return result(null);
      }

      if (event.type === "system-wake") {
        status = statusBeforeSleep;
        return result(null);
      }

      if (event.type === "end-work") {
        status = "idle";
        activeReminder = null;
        snoozedReminder = null;
        snoozedUntil = null;
        return result(null);
      }

      if (event.type === "snooze-reminder") {
        if (activeReminder !== null && activeReminder.kind !== "blink") {
          snoozedReminder = activeReminder;
          snoozedUntil = event.at + 5 * 60_000;
        }
        activeReminder = null;
        return result(null);
      }

      if (event.type === "complete-reminder") {
        if (activeReminder?.kind === "gaze") {
          gazeElapsedMs = 0;
        } else if (activeReminder?.kind === "movement-break") {
          sedentaryElapsedMs = 0;
          if (activeReminder.includesGaze) {
            gazeElapsedMs = 0;
          }
        } else if (activeReminder?.kind === "blink") {
          blinkElapsedMs = 0;
          blinkTargetMs = nextBlinkTarget();
        } else if (activeReminder?.kind === "micro-exercise") {
          const period = periodAt(event.at);
          if (period) completedExercisePeriods.add(period.key);
        }
        activeReminder = null;
        return result(null);
      }

      if (snoozedUntil !== null) {
        if (event.at < snoozedUntil) {
          return result(null);
        }
        activeReminder = snoozedReminder;
        snoozedReminder = null;
        snoozedUntil = null;
        return result();
      }

      const currentPeriod = periodAt(event.at);

      if (status === "working" && sedentaryElapsedMs >= sedentaryIntervalMs) {
        activeReminder = {
          kind: "movement-break",
          durationSeconds: 120,
          includesGaze: gazeElapsedMs >= gazeIntervalMs,
        };
      } else if (
        status === "working" &&
        exerciseEnabled &&
        currentPeriod !== null &&
        !completedExercisePeriods.has(currentPeriod.key) &&
        (exerciseElapsedByPeriod.get(currentPeriod.key) ?? 0) >= exerciseAfterMs
      ) {
        activeReminder = {
          kind: "micro-exercise",
          durationSeconds: 120,
          period: currentPeriod.period,
        };
      } else if (status === "working" && gazeElapsedMs >= gazeIntervalMs) {
        activeReminder = {
            kind: "gaze",
            durationSeconds: 20,
        };
      } else if (
        status === "working" &&
        blinkEnabled &&
        blinkElapsedMs >= blinkTargetMs &&
        gazeIntervalMs - gazeElapsedMs > reminderGuardWindowMs &&
        sedentaryIntervalMs - sedentaryElapsedMs > reminderGuardWindowMs
      ) {
        activeReminder = {
          kind: "blink",
          autoDismissSeconds: 5,
        };
      }

      return result();
    },
  };
}
