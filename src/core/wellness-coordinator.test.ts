import { describe, expect, it } from "vitest";

import { createWellnessCoordinator } from "./wellness-coordinator";

const minute = 60_000;
const at = (minutes: number) => minutes * minute;

describe("wellness coordinator", () => {
  it("reminds the user to look into the distance after 20 minutes of work", () => {
    const coordinator = createWellnessCoordinator({ blinkEnabled: false, exerciseEnabled: false });

    expect(coordinator.dispatch({ type: "time-passed", at: at(30) }).reminder).toBeNull();

    coordinator.dispatch({ type: "start-work", at: at(30) });

    expect(coordinator.dispatch({ type: "time-passed", at: at(49) }).reminder).toBeNull();
    expect(coordinator.dispatch({ type: "time-passed", at: at(50) }).reminder).toMatchObject({
      kind: "gaze",
      durationSeconds: 20,
    });
  });

  it("does not count paused time as work time", () => {
    const coordinator = createWellnessCoordinator({ blinkEnabled: false, exerciseEnabled: false });

    coordinator.dispatch({ type: "start-work", at: at(0) });
    coordinator.dispatch({ type: "time-passed", at: at(10) });
    coordinator.dispatch({ type: "pause-work", at: at(10) });
    coordinator.dispatch({ type: "time-passed", at: at(30) });
    coordinator.dispatch({ type: "resume-work", at: at(30) });

    expect(coordinator.dispatch({ type: "time-passed", at: at(39) }).reminder).toBeNull();
    expect(coordinator.dispatch({ type: "time-passed", at: at(40) }).reminder?.kind).toBe("gaze");
  });

  it("combines the 40-minute movement break with a due gaze break", () => {
    const coordinator = createWellnessCoordinator({ blinkEnabled: false, exerciseEnabled: false });

    coordinator.dispatch({ type: "start-work", at: at(0) });
    expect(coordinator.dispatch({ type: "time-passed", at: at(20) }).reminder?.kind).toBe("gaze");
    coordinator.dispatch({ type: "complete-reminder", at: at(20) });

    expect(coordinator.dispatch({ type: "time-passed", at: at(39) }).reminder).toBeNull();
    expect(coordinator.dispatch({ type: "time-passed", at: at(40) }).reminder).toMatchObject({
      kind: "movement-break",
      includesGaze: true,
      durationSeconds: 120,
    });
  });

  it("ends and clears the work round when a movement break is completed", () => {
    const coordinator = createWellnessCoordinator({ blinkEnabled: false, exerciseEnabled: false });

    coordinator.dispatch({ type: "start-work", at: at(0) });
    expect(coordinator.dispatch({ type: "time-passed", at: at(40) }).reminder?.kind).toBe(
      "movement-break",
    );

    expect(coordinator.dispatch({ type: "complete-reminder", at: at(41) })).toMatchObject({
      reminder: null,
      snapshot: {
        status: "idle",
        sessionElapsedMs: 0,
        gazeRemainingMs: at(20),
        sedentaryRemainingMs: at(40),
      },
    });

    expect(coordinator.dispatch({ type: "time-passed", at: at(90) }).reminder).toBeNull();
  });

  it("shows a lightweight blink reminder at a randomized 3 to 7 minute interval", () => {
    const coordinator = createWellnessCoordinator({ random: () => 0, exerciseEnabled: false });

    coordinator.dispatch({ type: "start-work", at: at(0) });

    expect(coordinator.dispatch({ type: "time-passed", at: at(2) }).reminder).toBeNull();
    expect(coordinator.dispatch({ type: "time-passed", at: at(3) }).reminder).toMatchObject({
      kind: "blink",
      autoDismissSeconds: 5,
    });
  });

  it("offers one micro exercise in each working period after 30 minutes", () => {
    const coordinator = createWellnessCoordinator({ blinkEnabled: false });
    const morning = new Date(2026, 8, 21, 9, 0).getTime();

    coordinator.dispatch({ type: "start-work", at: morning });

    expect(coordinator.dispatch({ type: "time-passed", at: morning + at(29) }).reminder?.kind).toBe("gaze");
    coordinator.dispatch({ type: "complete-reminder", at: morning + at(29) });
    expect(coordinator.dispatch({ type: "time-passed", at: morning + at(30) }).reminder).toMatchObject({
      kind: "micro-exercise",
      durationSeconds: 120,
      period: "morning",
    });
    coordinator.dispatch({ type: "complete-reminder", at: morning + at(30) });

    expect(coordinator.dispatch({ type: "time-passed", at: morning + at(35) }).reminder).toBeNull();
  });

  it("snoozes an action reminder for five minutes", () => {
    const coordinator = createWellnessCoordinator({ blinkEnabled: false, exerciseEnabled: false });

    coordinator.dispatch({ type: "start-work", at: at(0) });
    expect(coordinator.dispatch({ type: "time-passed", at: at(20) }).reminder?.kind).toBe("gaze");
    coordinator.dispatch({ type: "snooze-reminder", at: at(20) });

    expect(coordinator.dispatch({ type: "time-passed", at: at(24) }).reminder).toBeNull();
    expect(coordinator.dispatch({ type: "time-passed", at: at(25) }).reminder?.kind).toBe("gaze");
  });

  it("returns a view snapshot for the desktop interface", () => {
    const coordinator = createWellnessCoordinator({ blinkEnabled: false, exerciseEnabled: false });

    expect(coordinator.dispatch({ type: "start-work", at: at(0) }).snapshot).toMatchObject({
      status: "working",
      sessionElapsedMs: 0,
      gazeRemainingMs: at(20),
      sedentaryRemainingMs: at(40),
    });

    expect(coordinator.dispatch({ type: "pause-work", at: at(10) }).snapshot).toMatchObject({
      status: "paused",
      sessionElapsedMs: at(10),
      gazeRemainingMs: at(10),
      sedentaryRemainingMs: at(30),
    });
  });

  it("stops all reminders after the work session ends", () => {
    const coordinator = createWellnessCoordinator({ blinkEnabled: false, exerciseEnabled: false });

    coordinator.dispatch({ type: "start-work", at: at(0) });
    coordinator.dispatch({ type: "end-work", at: at(10) });

    expect(coordinator.dispatch({ type: "time-passed", at: at(60) })).toMatchObject({
      reminder: null,
      snapshot: {
        status: "idle",
        sessionElapsedMs: 0,
        gazeRemainingMs: at(20),
        sedentaryRemainingMs: at(40),
      },
    });
  });

  it("honors user-configured gaze and sedentary intervals", () => {
    const coordinator = createWellnessCoordinator({
      blinkEnabled: false,
      exerciseEnabled: false,
      gazeIntervalMinutes: 1,
      sedentaryIntervalMinutes: 2,
    });

    coordinator.dispatch({ type: "start-work", at: at(0) });
    expect(coordinator.dispatch({ type: "time-passed", at: at(1) }).reminder?.kind).toBe("gaze");
    coordinator.dispatch({ type: "complete-reminder", at: at(1) });
    expect(coordinator.dispatch({ type: "time-passed", at: at(2) }).reminder?.kind).toBe(
      "movement-break",
    );
  });

  it("applies changed reminder intervals to the current work round", () => {
    const coordinator = createWellnessCoordinator({
      blinkEnabled: false,
      exerciseEnabled: false,
      gazeIntervalMinutes: 20,
      sedentaryIntervalMinutes: 40,
    });

    coordinator.dispatch({ type: "start-work", at: at(0) });
    coordinator.dispatch({ type: "time-passed", at: at(5) });

    expect(
      coordinator.dispatch({
        type: "apply-settings",
        at: at(5),
        settings: { gazeIntervalMinutes: 30, sedentaryIntervalMinutes: 60 },
      }).snapshot,
    ).toMatchObject({
      gazeRemainingMs: at(25),
      sedentaryRemainingMs: at(55),
    });

    const overdue = createWellnessCoordinator({
      blinkEnabled: false,
      exerciseEnabled: false,
      gazeIntervalMinutes: 20,
      sedentaryIntervalMinutes: 40,
    });
    overdue.dispatch({ type: "start-work", at: at(0) });
    overdue.dispatch({ type: "time-passed", at: at(15) });

    expect(
      overdue.dispatch({
        type: "apply-settings",
        at: at(15),
        settings: { gazeIntervalMinutes: 10 },
      }).reminder?.kind,
    ).toBe("gaze");
  });

  it("does not count time spent asleep after the computer wakes", () => {
    const coordinator = createWellnessCoordinator({ blinkEnabled: false, exerciseEnabled: false });

    coordinator.dispatch({ type: "start-work", at: at(0) });
    coordinator.dispatch({ type: "time-passed", at: at(10) });
    coordinator.dispatch({ type: "system-sleep", at: at(10) });
    coordinator.dispatch({ type: "system-wake", at: at(130) });

    expect(coordinator.dispatch({ type: "time-passed", at: at(139) }).reminder).toBeNull();
    expect(coordinator.dispatch({ type: "time-passed", at: at(140) }).reminder?.kind).toBe("gaze");
  });

  it("restores an interrupted work session as paused without counting offline time", () => {
    const original = createWellnessCoordinator({ blinkEnabled: false, exerciseEnabled: false });

    original.dispatch({ type: "start-work", at: at(0) });
    const saved = original.dispatch({ type: "time-passed", at: at(15) }).checkpoint;

    const restored = createWellnessCoordinator({
      blinkEnabled: false,
      exerciseEnabled: false,
      checkpoint: saved,
    });

    expect(restored.dispatch({ type: "time-passed", at: at(120) }).snapshot).toMatchObject({
      status: "paused",
      sessionElapsedMs: at(15),
      gazeRemainingMs: at(5),
    });

    restored.dispatch({ type: "resume-work", at: at(120) });
    expect(restored.dispatch({ type: "time-passed", at: at(125) }).reminder?.kind).toBe("gaze");
  });
});
