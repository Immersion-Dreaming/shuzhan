import "./styles.css";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission as requestTauriNotificationPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import {
  createWellnessCoordinator,
  type CoordinatorCheckpoint,
  type CoordinatorOptions,
  type CoordinatorResult,
  type Reminder,
} from "./core/wellness-coordinator";
import {
  createCompanionPresentation,
  type CompanionAction,
} from "./companion-presentation";
import { chooseReminderPresentation, type ReminderPresentation } from "./notification-policy";
import { createSessionPresentation } from "./session-presentation";

type DailyStats = {
  date: string;
  gaze: number;
  movement: number;
  exercise: number;
};

type AppSettings = Required<
  Pick<
    CoordinatorOptions,
    | "blinkEnabled"
    | "exerciseEnabled"
    | "gazeIntervalMinutes"
    | "sedentaryIntervalMinutes"
    | "blinkMinimumMinutes"
    | "blinkMaximumMinutes"
    | "exerciseAfterMinutes"
  >
>;

const defaultSettings: AppSettings = {
  blinkEnabled: true,
  exerciseEnabled: true,
  gazeIntervalMinutes: 20,
  sedentaryIntervalMinutes: 40,
  blinkMinimumMinutes: 3,
  blinkMaximumMinutes: 7,
  exerciseAfterMinutes: 30,
};

const $ = <T extends HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function loadSettings(): AppSettings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem("wellness-settings") ?? "{}") };
  } catch {
    return defaultSettings;
  }
}

function loadStats(): DailyStats {
  const empty: DailyStats = { date: localDateKey(), gaze: 0, movement: 0, exercise: 0 };
  try {
    const stored = JSON.parse(localStorage.getItem("wellness-daily-stats") ?? "null") as DailyStats | null;
    return stored?.date === empty.date ? stored : empty;
  } catch {
    return empty;
  }
}

function loadCheckpoint(): CoordinatorCheckpoint | undefined {
  try {
    const checkpoint = JSON.parse(
      localStorage.getItem("wellness-session-checkpoint") ?? "null",
    ) as CoordinatorCheckpoint | null;
    return checkpoint?.version === 1 && checkpoint.status !== "idle" ? checkpoint : undefined;
  } catch {
    return undefined;
  }
}

let settings = loadSettings();
let stats = loadStats();
const restoredCheckpoint = loadCheckpoint();
let restoredSession = restoredCheckpoint !== undefined;
let coordinator = createWellnessCoordinator({ ...settings, checkpoint: restoredCheckpoint });
let currentResult = coordinator.dispatch({ type: "time-passed", at: Date.now() });
let shownReminder: Reminder | null = null;
let blinkTimer: number | null = null;
let reminderEscalationTimer: number | null = null;

const statusLabel = $("#status-label");
const statusDot = $("#status-dot");
const sessionTime = $("#session-time");
const sessionCaption = $("#session-caption");
const startButton = $("#start-button") as HTMLButtonElement;
const pauseButton = $("#pause-button") as HTMLButtonElement;
const endButton = $("#end-button") as HTMLButtonElement;
const gazeCountdown = $("#gaze-countdown");
const movementCountdown = $("#movement-countdown");
const blinkToast = $("#blink-toast");
const reminderBackdrop = $("#reminder-backdrop");
const reminderSymbol = $("#reminder-symbol");
const reminderEyebrow = $("#reminder-eyebrow");
const reminderTitle = $("#reminder-title");
const reminderDescription = $("#reminder-description");
const exerciseSteps = $("#exercise-steps");
const completeButton = $("#complete-button") as HTMLButtonElement;
const settingsDialog = $("#settings-dialog") as HTMLDialogElement;

function persistCheckpoint(result: CoordinatorResult) {
  if (result.snapshot.status === "idle") {
    localStorage.removeItem("wellness-session-checkpoint");
  } else {
    localStorage.setItem("wellness-session-checkpoint", JSON.stringify(result.checkpoint));
  }
}

function updateTrayStatus(result: CoordinatorResult) {
  if (!isTauri()) return;
  void invoke("update_tray_status", {
    title: createSessionPresentation(result.snapshot).trayTitle,
  });
}

function publishCompanionState(result: CoordinatorResult) {
  if (!isTauri()) return;
  void emitTo("companion", "companion-state", createCompanionPresentation(result));
}

function formatDuration(milliseconds: number, includeSeconds = false) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (includeSeconds) {
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }
  if (totalSeconds < 60) return "不到 1 分钟";
  return `${Math.ceil(totalSeconds / 60)} 分钟后`;
}

function render(result: CoordinatorResult) {
  currentResult = result;
  persistCheckpoint(result);
  updateTrayStatus(result);
  publishCompanionState(result);
  const { snapshot } = result;
  const working = snapshot.status === "working";
  const paused = snapshot.status === "paused";

  statusLabel.textContent = working ? "工作中" : paused ? "已暂停" : "尚未开始工作";
  statusDot.className = `status-dot ${working ? "active" : paused ? "paused" : ""}`;
  sessionTime.textContent = formatDuration(snapshot.sessionElapsedMs, true);
  sessionCaption.textContent = working
    ? "可以关闭主窗口，舒展精灵会继续陪你提醒。"
    : paused
      ? restoredSession
        ? "已恢复上次工作进度，离线时间没有计入。"
        : "计时已经暂停，准备好后继续。"
      : "开始后，将按你的节奏提醒远眺、眨眼和活动。";
  startButton.textContent = paused ? "继续工作" : "开始工作";
  startButton.classList.toggle("hidden", working);
  pauseButton.classList.toggle("hidden", !working);
  endButton.classList.toggle("hidden", snapshot.status === "idle");
  gazeCountdown.textContent = snapshot.status === "idle" ? `${settings.gazeIntervalMinutes} 分钟后` : formatDuration(snapshot.gazeRemainingMs);
  movementCountdown.textContent = snapshot.status === "idle" ? `${settings.sedentaryIntervalMinutes} 分钟后` : formatDuration(snapshot.sedentaryRemainingMs);

  void presentReminder(result.reminder);
}

function reminderCopy(reminder: Reminder) {
  if (reminder.kind === "gaze") {
    return { symbol: "◉", eyebrow: "眼睛休息", title: "看看远处 20 秒", description: "放松视线，选择约 6 米以外的目标，让眼睛从近距离工作中缓一缓。" };
  }
  if (reminder.kind === "movement-break") {
    return {
      symbol: "↟",
      eyebrow: `已经连续工作 ${settings.sedentaryIntervalMinutes} 分钟`,
      title: "起来走走吧",
      description: reminder.includesGaze
        ? "离开座位活动 2–5 分钟，同时看看远处。这次完成后会同时重置久坐和远眺计时。"
        : "离开座位活动 2–5 分钟，喝口水、伸展一下都很好。",
    };
  }
  return { symbol: "↗", eyebrow: "今日微运动", title: "用两分钟活动一下", description: "动作以舒适为准；如有不适，请立即停止。" };
}

async function presentReminder(reminder: Reminder | null) {
  if (!reminder || shownReminder) return;
  shownReminder = reminder;

  if (isTauri()) {
    const companionVisible = await invoke<boolean>("is_companion_visible");
    if (!companionVisible) {
      const presentation = chooseReminderPresentation(reminder, false);
      deliverSystemNotification(presentation);
      if (reminder.kind !== "blink") {
        const repeatAfterMs = reminder.kind === "movement-break" ? 5 * 60_000 : 8 * 60_000;
        reminderEscalationTimer = window.setTimeout(() => {
          if (shownReminder === reminder) deliverSystemNotification(presentation);
        }, repeatAfterMs);
      }
    }
    if (reminder.kind === "blink") {
      blinkTimer = window.setTimeout(
        () => completeReminder(false),
        reminder.autoDismissSeconds * 1000,
      );
    }
    return;
  }

  const windowFocused = isTauri()
    ? await getCurrentWindow().isFocused()
    : document.hasFocus() && document.visibilityState === "visible";
  if (shownReminder !== reminder) return;
  const presentation = chooseReminderPresentation(reminder, windowFocused);

  if (reminder.kind === "blink") {
    if (presentation.surface === "system") {
      deliverSystemNotification(presentation);
    } else {
      blinkToast.classList.remove("hidden");
    }
    blinkTimer = window.setTimeout(() => completeReminder(false), reminder.autoDismissSeconds * 1000);
    return;
  }

  const copy = reminderCopy(reminder);
  reminderSymbol.textContent = copy.symbol;
  reminderEyebrow.textContent = copy.eyebrow;
  reminderTitle.textContent = copy.title;
  reminderDescription.textContent = copy.description;
  exerciseSteps.classList.toggle("hidden", reminder.kind !== "micro-exercise");
  completeButton.textContent =
    reminder.kind === "movement-break" ? "我起来了，结束本轮" : "完成了";
  reminderBackdrop.classList.remove("hidden");
  if (presentation.surface === "system") {
    deliverSystemNotification(presentation);
    const repeatAfterMs = reminder.kind === "movement-break" ? 5 * 60_000 : 8 * 60_000;
    reminderEscalationTimer = window.setTimeout(() => {
      if (shownReminder === reminder) deliverSystemNotification(presentation);
    }, repeatAfterMs);
  }
}

function hideReminder() {
  if (blinkTimer !== null) window.clearTimeout(blinkTimer);
  if (reminderEscalationTimer !== null) window.clearTimeout(reminderEscalationTimer);
  blinkTimer = null;
  reminderEscalationTimer = null;
  shownReminder = null;
  blinkToast.classList.add("hidden");
  reminderBackdrop.classList.add("hidden");
}

function saveStats() {
  localStorage.setItem("wellness-daily-stats", JSON.stringify(stats));
  $("#gaze-stat").textContent = String(stats.gaze);
  $("#movement-stat").textContent = String(stats.movement);
  $("#exercise-stat").textContent = String(stats.exercise);
}

function completeReminder(countCompletion = true) {
  if (countCompletion && shownReminder) {
    if (shownReminder.kind === "gaze") stats.gaze += 1;
    if (shownReminder.kind === "movement-break") {
      stats.movement += 1;
      if (shownReminder.includesGaze) stats.gaze += 1;
    }
    if (shownReminder.kind === "micro-exercise") stats.exercise += 1;
    saveStats();
  }
  hideReminder();
  render(coordinator.dispatch({ type: "complete-reminder", at: Date.now() }));
}

function deliverSystemNotification(presentation: ReminderPresentation) {
  const { title, body, urgency } = presentation;
  if (isTauri()) {
    void isPermissionGranted().then((granted) => {
      if (granted) {
        sendNotification({
          title,
          body,
          sound: urgency === "prominent" ? "Ping" : undefined,
        });
      }
    });
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

async function requestNotificationPermission() {
  if (isTauri()) {
    if (!(await isPermissionGranted())) await requestTauriNotificationPermission();
    return;
  }
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

function startOrResumeWork() {
  const now = Date.now();
  if (currentResult.snapshot.status === "paused") {
    restoredSession = false;
    render(coordinator.dispatch({ type: "resume-work", at: now }));
  } else {
    coordinator = createWellnessCoordinator(settings);
    restoredSession = false;
    render(coordinator.dispatch({ type: "start-work", at: now }));
    void requestNotificationPermission();
  }
}

function pauseWork() {
  hideReminder();
  render(coordinator.dispatch({ type: "pause-work", at: Date.now() }));
}

function endWork() {
  hideReminder();
  restoredSession = false;
  render(coordinator.dispatch({ type: "end-work", at: Date.now() }));
}

startButton.addEventListener("click", startOrResumeWork);

pauseButton.addEventListener("click", pauseWork);

endButton.addEventListener("click", endWork);

$("#complete-button").addEventListener("click", () => completeReminder(true));
$("#snooze-button").addEventListener("click", () => {
  hideReminder();
  render(coordinator.dispatch({ type: "snooze-reminder", at: Date.now() }));
});

$("#settings-button").addEventListener("click", () => {
  ($("#gaze-setting") as HTMLInputElement).value = String(settings.gazeIntervalMinutes);
  ($("#sedentary-setting") as HTMLInputElement).value = String(settings.sedentaryIntervalMinutes);
  ($("#blink-min-setting") as HTMLInputElement).value = String(settings.blinkMinimumMinutes);
  ($("#blink-max-setting") as HTMLInputElement).value = String(settings.blinkMaximumMinutes);
  ($("#exercise-setting") as HTMLInputElement).value = String(settings.exerciseAfterMinutes);
  ($("#blink-enabled-setting") as HTMLInputElement).checked = settings.blinkEnabled;
  ($("#exercise-enabled-setting") as HTMLInputElement).checked = settings.exerciseEnabled;
  settingsDialog.showModal();
});

$("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const numberValue = (selector: string) => Number(($<HTMLInputElement>(selector)).value);
  const minimum = numberValue("#blink-min-setting");
  const maximum = Math.max(minimum, numberValue("#blink-max-setting"));
  settings = {
    gazeIntervalMinutes: numberValue("#gaze-setting"),
    sedentaryIntervalMinutes: numberValue("#sedentary-setting"),
    blinkMinimumMinutes: minimum,
    blinkMaximumMinutes: maximum,
    exerciseAfterMinutes: numberValue("#exercise-setting"),
    blinkEnabled: ($<HTMLInputElement>("#blink-enabled-setting")).checked,
    exerciseEnabled: ($<HTMLInputElement>("#exercise-enabled-setting")).checked,
  };
  localStorage.setItem("wellness-settings", JSON.stringify(settings));
  settingsDialog.close();
  render(coordinator.dispatch({ type: "apply-settings", at: Date.now(), settings }));
});

$("#test-notification").addEventListener("click", async () => {
  await requestNotificationPermission();
  deliverSystemNotification({
    surface: "system",
    urgency: "normal",
    title: "舒展通知测试",
    body: "通知工作正常。开始工作后，你可以安心关闭主窗口。",
  });
});

$("#preview-blink").addEventListener("click", () => {
  const preview = createCompanionPresentation({
    snapshot: currentResult.snapshot,
    reminder: { kind: "blink", autoDismissSeconds: 5 },
  });
  if (isTauri()) {
    void emitTo("companion", "companion-state", preview);
    window.setTimeout(() => publishCompanionState(currentResult), 5_000);
    return;
  }
  blinkToast.classList.remove("hidden");
  window.setTimeout(() => blinkToast.classList.add("hidden"), 5_000);
});

let lastHeartbeatAt = Date.now();

window.setInterval(() => {
  const now = Date.now();
  if (currentResult.snapshot.status === "working") {
    if (now - lastHeartbeatAt > 2 * 60_000) {
      coordinator.dispatch({ type: "system-sleep", at: lastHeartbeatAt });
      currentResult = coordinator.dispatch({ type: "system-wake", at: now });
    }
    render(coordinator.dispatch({ type: "time-passed", at: now }));
  }
  lastHeartbeatAt = now;
}, 1000);

if (isTauri()) {
  void listen<string>("tray-command", ({ payload }) => {
    if (payload === "toggle") {
      if (currentResult.snapshot.status === "working") pauseWork();
      else startOrResumeWork();
    }
    if (payload === "end") endWork();
  });
  void listen<CompanionAction>("companion-command", ({ payload }) => {
    if (payload === "start-work" || payload === "resume-work") startOrResumeWork();
    if (payload === "pause-work") pauseWork();
    if (payload === "complete-reminder") completeReminder(true);
    if (payload === "snooze-reminder") {
      hideReminder();
      render(coordinator.dispatch({ type: "snooze-reminder", at: Date.now() }));
    }
    if (payload === "open-main") {
      const mainWindow = getCurrentWindow();
      void mainWindow.show().then(() => mainWindow.setFocus());
    }
  });
  void listen("companion-ready", () => publishCompanionState(currentResult));
  void listen<boolean>("companion-visibility", ({ payload }) => {
    if (!payload && shownReminder) {
      deliverSystemNotification(chooseReminderPresentation(shownReminder, false));
    }
  });
}

$("#date-label").textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date());
saveStats();
render(currentResult);
