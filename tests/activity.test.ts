import { describe, it, expect } from "vitest";
import {
  activityState,
  integrate,
} from "../packages/activity-engine/src/index";
import { sample, setup, T } from "./helpers";
describe("evidence-based activity", () => {
  const c = setup();
  c.close();
  it.each([
    ["typing", { lastKeyboard: T }, T + 1000, "typing"],
    ["reading", {}, T + 1000, "reading"],
    ["generation", { generating: true }, T + 1000, "generating"],
    ["background", { visible: false }, T + 1000, "background"],
    ["blurred", { focused: false }, T + 1000, "background"],
    ["degraded", { parserStatus: "PARSER_DEGRADED" }, T + 1000, "background"],
    ["stale heartbeat", {}, T + 31000, "background"],
    ["idle", { at: T + 200000 }, T + 200000, "idle"],
    [
      "reading grace",
      { at: T + 200000, lastAssistantFinished: T + 190000 },
      T + 200000,
      "reading",
    ],
    [
      "grace expired",
      { at: T + 400000, lastAssistantFinished: T + 190000 },
      T + 400000,
      "idle",
    ],
    [
      "generation in background",
      { generating: true, focused: false },
      T + 1000,
      "background",
    ],
    ["no interaction on page load", { lastInteraction: 0 }, T, "idle"],
  ] as const)("%s", (_name, extra, at, expected) =>
    expect(activityState(sample(T, extra), at, c.config)).toBe(expected),
  );
  it("splits typing at exact five-second boundary", () => {
    const r = integrate(sample(T, { lastKeyboard: T }), T, T + 10000, c.config);
    expect(r.counters.typingSeconds).toBe(5);
    expect(r.counters.readingSeconds).toBe(5);
    expect(r.counters.activeSeconds).toBe(10);
  });
  it("never counts a two-hour open tab as two hours active", () => {
    const r = integrate(sample(), T, T + 7200000, c.config);
    expect(r.counters.activeSeconds).toBe(30);
    expect(r.counters.backgroundSeconds).toBe(7170);
  });
  it("stops exactly at idle threshold despite a fresh heartbeat", () => {
    const r = integrate(sample(T + 175000), T + 175000, T + 190000, c.config);
    expect(r.counters.readingSeconds).toBe(5);
    expect(r.counters.idleSeconds).toBe(10);
  });
  it("accounts for the full interval without overlaps", () => {
    const r = integrate(
      sample(T, { lastKeyboard: T }),
      T,
      T + 120000,
      c.config,
    ).counters;
    expect(
      r.typingSeconds +
        r.readingSeconds +
        r.generatingSeconds +
        r.idleSeconds +
        r.backgroundSeconds,
    ).toBe(r.wallClockSeconds);
  });
});
