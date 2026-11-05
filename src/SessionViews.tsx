import React, { useId } from "react";
import { Pause } from "lucide-react";
import {
  estimateRemainingMs,
  formatDuration,
  formatElapsed,
  type SessionPause,
  type sessionCounts,
} from "./session";

type Counts = ReturnType<typeof sessionCounts>;

const remainingLabel = (activeMs: number, counts: Counts) => {
  const estimate = estimateRemainingMs(
    activeMs,
    counts.completed,
    counts.remaining,
  );
  return estimate === null ? null : `~${formatDuration(estimate)} left`;
};

export function SessionBar({
  counts,
  activeMs,
  onPause,
  onEnd,
}: {
  counts: Counts;
  activeMs: number;
  onPause: () => void;
  onEnd: () => void;
}) {
  const left = remainingLabel(activeMs, counts);
  return (
    <div className="session-bar">
      <div className="session-bar-progress">
        <span>
          <strong>{counts.handled}</strong> / {counts.total}
        </span>
        <div className="progress-track">
          <div
            style={{
              width: `${(counts.handled / Math.max(1, counts.total)) * 100}%`,
            }}
          />
        </div>
      </div>
      <div className="session-bar-time">
        <span role="timer" aria-label="Active time">
          {formatElapsed(activeMs)}
        </span>
        {left && <small>{left}</small>}
      </div>
      <div className="session-bar-actions">
        <button className="button" onClick={onPause}>
          <Pause size={15} /> Pause
        </button>
        <button className="button" onClick={onEnd}>
          End session
        </button>
      </div>
    </div>
  );
}

export function SessionBanner({
  name,
  counts,
  activeMs,
  onResume,
  onEnd,
}: {
  name: string;
  counts: Counts;
  activeMs: number;
  onResume: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="session-banner" role="status">
      <div>
        <strong>Unfinished session</strong>
        <span>
          {name} · {counts.handled} of {counts.total} done ·{" "}
          {formatElapsed(activeMs)}
        </span>
      </div>
      <button className="button" onClick={onEnd}>
        End session
      </button>
      <button className="button dark" onClick={onResume}>
        Resume <kbd>F</kbd>
      </button>
    </div>
  );
}

const pauseCopy = (pause: SessionPause) => {
  const away = formatDuration(Date.now() - pause.since);
  if (pause.reason === "away")
    return { title: "Welcome back", detail: `You were away ${away}.` };
  if (pause.reason === "idle")
    return { title: "Still there?", detail: `No activity for ${away}.` };
  return { title: "Session paused", detail: "The timer is stopped." };
};

export function SessionPauseScreen({
  pause,
  counts,
  activeMs,
  onResume,
  onLeave,
  onEnd,
}: {
  pause: SessionPause;
  counts: Counts;
  activeMs: number;
  onResume: () => void;
  onLeave: () => void;
  onEnd: () => void;
}) {
  const titleId = useId();
  const { title, detail } = pauseCopy(pause);
  const left = remainingLabel(activeMs, counts);
  return (
    <div
      className="session-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="session-screen-card">
        <h2 id={titleId}>{title}</h2>
        <p>{detail}</p>
        <p className="session-screen-goal">
          <strong>{counts.remaining}</strong> left
          {left && ` · ${left.replace(" left", "")}`} ·{" "}
          {formatElapsed(activeMs)} so far
        </p>
        <button className="button dark" autoFocus onClick={onResume}>
          Resume
        </button>
        <span className="session-screen-hint">or press any key</span>
        <div className="session-screen-actions">
          <button className="button" onClick={onLeave}>
            Leave for now
          </button>
          <button className="button" onClick={onEnd}>
            End session
          </button>
        </div>
      </div>
    </div>
  );
}

export function SessionSummaryScreen({
  counts,
  activeMs,
  onKeepGoing,
  onReviewSkipped,
  onExport,
  onDone,
}: {
  counts: Counts;
  activeMs: number;
  onKeepGoing: () => void;
  onReviewSkipped: () => void;
  onExport: () => void;
  onDone: () => void;
}) {
  const titleId = useId();
  const actions = [
    counts.remaining > 0 && { label: "Keep going", onClick: onKeepGoing },
    counts.skipped > 0 && {
      label: `Review skipped (${counts.skipped})`,
      onClick: onReviewSkipped,
    },
    { label: "Export results", onClick: onExport },
    { label: "Done", onClick: onDone },
  ].filter((action) => !!action);
  return (
    <div
      className="session-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="session-screen-card">
        <h2 id={titleId}>
          {counts.remaining ? "Session ended" : "Session complete"}
        </h2>
        <dl className="session-stats">
          <div>
            <dt>Active time</dt>
            <dd>{formatElapsed(activeMs)}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{counts.completed}</dd>
          </div>
          <div>
            <dt>Skipped</dt>
            <dd>{counts.skipped}</dd>
          </div>
          <div>
            <dt>Left</dt>
            <dd>{counts.remaining}</dd>
          </div>
        </dl>
        <div className="session-screen-actions">
          {actions.map((action, i) => (
            <button
              key={action.label}
              className={`button ${i === 0 ? "dark" : ""}`}
              autoFocus={i === 0}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
