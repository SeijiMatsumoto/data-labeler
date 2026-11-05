import { describe, expect, it } from "vitest";
import { sample, type Dataset } from "./model";
import {
  estimateRemainingMs,
  formatDuration,
  formatElapsed,
  IDLE_MS,
  isIdle,
  recordInput,
  sessionCandidates,
  sessionCounts,
  startClock,
  tickClock,
} from "./session";

const dataset = (annotations: Dataset["annotations"]): Dataset => ({
  ...structuredClone(sample),
  annotations,
});
const [first, second] = sample.items.map((item) => item.id);
const complete = { values: { correct: true, helpfulness: 4 } };

describe("session targets", () => {
  it("starts from the current position and wraps", () => {
    const ids = sample.items.map((item) => item.id);
    expect(sessionCandidates(dataset({}), 1).ids).toEqual([
      ...ids.slice(1),
      ids[0],
    ]);
  });
  it("leaves out completed and skipped examples", () => {
    const d = dataset({
      [first]: complete,
      [second]: { values: {}, skipped: true },
    });
    const { ids, reviewingSkipped } = sessionCandidates(d, 0);
    expect(ids).not.toContain(first);
    expect(ids).not.toContain(second);
    expect(reviewingSkipped).toBe(false);
  });
  it("falls back to skipped examples once nothing else is unfinished", () => {
    const annotations: NonNullable<Dataset["annotations"]> = Object.fromEntries(
      sample.items.map((item) => [item.id, complete]),
    );
    annotations[second] = { values: {}, skipped: true };
    expect(sessionCandidates(dataset(annotations), 0)).toEqual({
      ids: [second],
      reviewingSkipped: true,
    });
  });
  it("counts only examples in the session that still exist", () => {
    const d = dataset({
      [first]: complete,
      [second]: { values: {}, skipped: true },
    });
    const session = {
      datasetId: d.id,
      itemIds: [first, second, "removed"],
      activeMs: 0,
    };
    expect(sessionCounts(d, session)).toEqual({
      total: 2,
      completed: 1,
      skipped: 1,
      handled: 2,
      remaining: 0,
    });
  });
});

describe("session estimate and formatting", () => {
  it("waits for three completed examples before estimating", () => {
    expect(estimateRemainingMs(60000, 2, 10)).toBeNull();
    expect(estimateRemainingMs(60000, 3, 10)).toBe(200000);
    expect(estimateRemainingMs(60000, 3, 0)).toBeNull();
  });
  it("keeps MM:SS past an hour", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(522000)).toBe("08:42");
    expect(formatElapsed(4325000)).toBe("72:05");
  });
  it("formats durations for people", () => {
    expect(formatDuration(5000)).toBe("1 min");
    expect(formatDuration(14 * 60000)).toBe("14 min");
    expect(formatDuration(60 * 60000)).toBe("1 hr");
    expect(formatDuration(72 * 60000)).toBe("1 hr 12 min");
  });
});

describe("session clock", () => {
  it("accumulates time between ticks", () => {
    const clock = tickClock(tickClock(startClock(500, 1000), 2000), 3500);
    expect(clock.activeMs).toBe(3000);
  });
  it("goes idle only after the threshold since the last input", () => {
    const clock = recordInput(startClock(0, 0), 10000);
    expect(isIdle(clock, 10000 + IDLE_MS - 1)).toBe(false);
    expect(isIdle(clock, 10000 + IDLE_MS)).toBe(true);
  });
  it("remembers the active time to roll back to at the last input", () => {
    const clock = tickClock(recordInput(startClock(1000, 0), 4000), 90000);
    expect(clock.activeAtInput).toBe(5000);
    expect(clock.activeMs).toBe(91000);
  });
});
