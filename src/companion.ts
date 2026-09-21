import "./companion.css";

import { invoke } from "@tauri-apps/api/core";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { emitTo, listen } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";

import type {
  CompanionAction,
  CompanionPresentation,
} from "./companion-presentation";
import {
  compactAnchorAfterMove,
  shouldStartWindowDrag,
  type CompanionWindowMode,
  type PointerPoint,
} from "./companion-drag";

const compactSize = new LogicalSize(76, 76);
const blinkCueSize = new LogicalSize(250, 76);
const expandedSize = new LogicalSize(360, 210);
const companionWindow = getCurrentWindow();

const companion = document.querySelector<HTMLElement>("#companion")!;
const orb = document.querySelector<HTMLButtonElement>("#orb")!;
const card = document.querySelector<HTMLElement>("#companion-card")!;
const closeCard = document.querySelector<HTMLButtonElement>("#close-card")!;
const eyebrow = document.querySelector<HTMLElement>("#companion-eyebrow")!;
const title = document.querySelector<HTMLElement>("#companion-title")!;
const detail = document.querySelector<HTMLElement>("#companion-detail")!;
const primary = document.querySelector<HTMLButtonElement>("#companion-primary")!;
const secondary = document.querySelector<HTMLButtonElement>("#companion-secondary")!;
const blinkHint = document.querySelector<HTMLElement>("#blink-hint")!;

let presentation: CompanionPresentation | null = null;
let manuallyExpanded = false;
let compactAnchor: PhysicalPosition | null = null;
let movingProgrammatically = false;
let dragOrigin: PointerPoint | null = null;
let suppressOrbClick = false;
let windowMode: CompanionWindowMode = "compact";

async function placeAtComfortableCorner() {
  const stored = localStorage.getItem("wellness-companion-position");
  if (stored) {
    try {
      const { x, y } = JSON.parse(stored) as { x: number; y: number };
      compactAnchor = new PhysicalPosition(x, y);
      await companionWindow.setPosition(compactAnchor);
      return;
    } catch {
      localStorage.removeItem("wellness-companion-position");
    }
  }

  const monitor = await primaryMonitor();
  if (!monitor) return;
  const margin = Math.round(24 * monitor.scaleFactor);
  const compactWidth = Math.round(76 * monitor.scaleFactor);
  const compactHeight = Math.round(76 * monitor.scaleFactor);
  compactAnchor = new PhysicalPosition(
    monitor.workArea.position.x + monitor.workArea.size.width - compactWidth - margin,
    monitor.workArea.position.y + monitor.workArea.size.height - compactHeight - margin,
  );
  await companionWindow.setPosition(compactAnchor);
}

async function setWindowMode(mode: CompanionWindowMode) {
  if (mode === windowMode) return;
  movingProgrammatically = true;
  if (windowMode === "compact") compactAnchor = await companionWindow.outerPosition();
  const expanded = mode === "expanded";
  companion.classList.toggle("is-expanded", expanded);
  card.classList.toggle("hidden", !expanded);
  orb.classList.toggle("hidden", expanded);
  blinkHint.classList.toggle("hidden", mode !== "blink");
  const targetSize = expanded ? expandedSize : mode === "blink" ? blinkCueSize : compactSize;
  await companionWindow.setSize(targetSize);
  if (compactAnchor) {
    if (mode !== "compact") {
      const monitor = (await currentMonitor()) ?? (await primaryMonitor());
      const scaleFactor = monitor?.scaleFactor ?? 1;
      const targetWidth = Math.round(targetSize.width * scaleFactor);
      const targetHeight = Math.round(targetSize.height * scaleFactor);
      const desiredX =
        compactAnchor.x - Math.round((targetSize.width - compactSize.width) * scaleFactor);
      const desiredY =
        compactAnchor.y - Math.round((targetSize.height - compactSize.height) * scaleFactor);
      const x = monitor
        ? Math.min(
            Math.max(desiredX, monitor.workArea.position.x),
            monitor.workArea.position.x + monitor.workArea.size.width - targetWidth,
          )
        : desiredX;
      const y = monitor
        ? Math.min(
            Math.max(desiredY, monitor.workArea.position.y),
            monitor.workArea.position.y + monitor.workArea.size.height - targetHeight,
          )
        : desiredY;
      await companionWindow.setPosition(
        new PhysicalPosition(x, y),
      );
    } else {
      await companionWindow.setPosition(compactAnchor);
    }
  }
  windowMode = mode;
  movingProgrammatically = false;
}

function bindAction(button: HTMLButtonElement, action: CompanionAction | null, label: string | null) {
  button.classList.toggle("hidden", action === null || label === null);
  button.textContent = label ?? "";
  button.dataset.action = action ?? "";
}

async function render(next: CompanionPresentation) {
  presentation = next;
  for (const mode of ["idle", "working", "paused", "blink", "gaze", "exercise", "movement"]) {
    companion.classList.remove(`companion--${mode}`);
  }
  companion.classList.add(`companion--${next.mode}`);
  eyebrow.textContent = next.eyebrow;
  title.textContent = next.title;
  detail.textContent = next.detail;
  closeCard.setAttribute("aria-label", next.expanded ? "稍后提醒" : "收起");
  bindAction(primary, next.primaryAction, next.primaryLabel);
  bindAction(secondary, next.secondaryAction, next.secondaryLabel);
  const nextWindowMode =
    next.expanded || manuallyExpanded
      ? "expanded"
      : next.attentionCue === "gentle-blink"
        ? "blink"
        : "compact";
  blinkHint.querySelector("strong")!.textContent = next.hintLabel ?? "";
  await setWindowMode(nextWindowMode);
}

async function sendAction(action: CompanionAction) {
  manuallyExpanded = false;
  if (action === "open-main") {
    await setWindowMode("compact");
    await invoke("show_main_window");
    return;
  }
  await emitTo("main", "companion-command", action);
}

function armWindowDrag(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest("button:not(#orb)")) return;
  dragOrigin = { x: event.clientX, y: event.clientY };
}

orb.addEventListener("pointerdown", armWindowDrag);
card.addEventListener("pointerdown", armWindowDrag);

window.addEventListener("pointermove", (event) => {
  if (!dragOrigin || !shouldStartWindowDrag(dragOrigin, { x: event.clientX, y: event.clientY })) {
    return;
  }
  suppressOrbClick = !companion.classList.contains("is-expanded");
  dragOrigin = null;
  void companionWindow.startDragging();
});

for (const eventName of ["pointerup", "pointercancel"] as const) {
  window.addEventListener(eventName, () => {
    dragOrigin = null;
  });
}

orb.addEventListener("click", (event) => {
  if (suppressOrbClick) {
    suppressOrbClick = false;
    event.preventDefault();
    return;
  }
  manuallyExpanded = true;
  if (presentation) void setWindowMode("expanded");
});

closeCard.addEventListener("click", () => {
  if (presentation?.expanded && presentation.secondaryAction) {
    void sendAction(presentation.secondaryAction);
    return;
  }
  manuallyExpanded = false;
  void setWindowMode(presentation?.attentionCue === "gentle-blink" ? "blink" : "compact");
});

for (const button of [primary, secondary]) {
  button.addEventListener("click", () => {
    const action = button.dataset.action as CompanionAction | undefined;
    if (action) void sendAction(action);
  });
}

void listen<CompanionPresentation>("companion-state", ({ payload }) => {
  void render(payload);
});

void companionWindow.onMoved(async ({ payload }) => {
  if (movingProgrammatically || companion.classList.contains("is-expanded")) return;
  const monitor = (await currentMonitor()) ?? (await primaryMonitor());
  const anchor = compactAnchorAfterMove(payload, windowMode, monitor?.scaleFactor ?? 1);
  compactAnchor = new PhysicalPosition(anchor.x, anchor.y);
  localStorage.setItem(
    "wellness-companion-position",
    JSON.stringify({ x: anchor.x, y: anchor.y }),
  );
});

void companionWindow.setSize(compactSize).then(async () => {
  await placeAtComfortableCorner();
  await emitTo("main", "companion-ready");
});
