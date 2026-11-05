import { useEffect, useRef } from "react";
import { status, type Dataset } from "./model";

export const SESSIONS_KEY = "labeldesk.sessions.v1";
export const IDLE_MS = 3 * 60 * 1000;
const MIN_COMPLETED_FOR_ESTIMATE = 3;

export type LabelSession = {
  datasetId: string;
  itemIds: string[];
  activeMs: number;
};
export type Sessions = Record<string, LabelSession>;
export type PauseReason = "manual" | "away" | "idle";
export type SessionPause = { reason: PauseReason; since: number };

export function readSessions(): Sessions {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSIONS_KEY) || "{}");
    return Object.fromEntries(
      Object.entries(parsed as Sessions).filter(
        ([, s]) =>
          typeof s?.datasetId === "string" &&
          Array.isArray(s.itemIds) &&
          Number.isFinite(s.activeMs),
      ),
    );
  } catch {
    return {};
  }
}
export function writeSessions(sessions: Sessions) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // Only the timer is lost; labels are stored separately.
  }
}

export const isUnfinished = (d: Dataset, id: string) =>
  ["unlabeled", "in progress"].includes(status(d, id));

/** Items a new session should cover, starting from the current position. */
export function sessionCandidates(d: Dataset, index: number) {
  const ordered = [...d.items.slice(index), ...d.items.slice(0, index)].map(
    (item) => item.id,
  );
  const unfinished = ordered.filter((id) => isUnfinished(d, id));
  return unfinished.length
    ? { ids: unfinished, reviewingSkipped: false }
    : {
        ids: ordered.filter((id) => status(d, id) === "skipped"),
        reviewingSkipped: true,
      };
}

export function unskipItems(d: Dataset, ids: string[]): Dataset {
  const annotations = { ...d.annotations };
  ids.forEach((id) => {
    if (annotations[id]?.skipped)
      annotations[id] = { ...annotations[id], skipped: false };
  });
  return { ...d, annotations };
}

export function sessionCounts(d: Dataset, session: LabelSession) {
  const known = new Set(d.items.map((item) => item.id));
  const ids = session.itemIds.filter((id) => known.has(id));
  const statuses = ids.map((id) => status(d, id));
  const completed = statuses.filter((s) => s === "completed").length;
  const skipped = statuses.filter((s) => s === "skipped").length;
  return {
    total: ids.length,
    completed,
    skipped,
    handled: completed + skipped,
    remaining: ids.length - completed - skipped,
  };
}

export function estimateRemainingMs(
  activeMs: number,
  completed: number,
  remaining: number,
) {
  if (completed < MIN_COMPLETED_FOR_ESTIMATE || !remaining) return null;
  return (activeMs / completed) * remaining;
}

export function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

export function formatDuration(ms: number) {
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} hr${rest ? ` ${rest} min` : ""}`;
}

export type Clock = {
  activeMs: number;
  lastTick: number;
  lastInput: number;
  activeAtInput: number;
};
export const startClock = (activeMs: number, now: number): Clock => ({
  activeMs,
  lastTick: now,
  lastInput: now,
  activeAtInput: activeMs,
});
export const tickClock = (clock: Clock, now: number): Clock => ({
  ...clock,
  activeMs: clock.activeMs + Math.max(0, now - clock.lastTick),
  lastTick: now,
});
export const recordInput = (clock: Clock, now: number): Clock => {
  const ticked = tickClock(clock, now);
  return { ...ticked, lastInput: now, activeAtInput: ticked.activeMs };
};
export const isIdle = (clock: Clock, now: number) =>
  now - clock.lastInput >= IDLE_MS;

const INPUT_EVENTS = [
  "keydown",
  "pointerdown",
  "pointermove",
  "wheel",
  "scroll",
  "touchstart",
];

/**
 * Counts active time only. Idle time is taken back off the clock, which also
 * covers a laptop sleeping with the tab visible, where no event fires.
 */
export function useActiveClock(
  running: boolean,
  activeMs: number,
  onChange: (activeMs: number) => void,
  onPause: (pause: SessionPause) => void,
) {
  const latest = useRef({ activeMs, onChange, onPause });
  latest.current = { activeMs, onChange, onPause };
  useEffect(() => {
    if (!running) return;
    let clock = startClock(latest.current.activeMs, Date.now());
    const tick = () => {
      const now = Date.now();
      if (isIdle(clock, now)) {
        latest.current.onChange(clock.activeAtInput);
        latest.current.onPause({ reason: "idle", since: clock.lastInput });
        return;
      }
      clock = tickClock(clock, now);
      latest.current.onChange(clock.activeMs);
    };
    const input = () => {
      clock = recordInput(clock, Date.now());
    };
    const visibility = () => {
      if (!document.hidden) return;
      tick();
      latest.current.onPause({ reason: "away", since: Date.now() });
    };
    const timer = setInterval(tick, 1000);
    const options = { capture: true, passive: true };
    INPUT_EVENTS.forEach((e) => window.addEventListener(e, input, options));
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      INPUT_EVENTS.forEach((e) =>
        window.removeEventListener(e, input, options),
      );
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [running]);
}
