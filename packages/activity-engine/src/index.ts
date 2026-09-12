import {
  zeroCounters,
  type ActivitySample,
  type ActivityState,
  type Config,
  type Counters,
} from "../../shared/src/index";
export interface Segment {
  start: number;
  end: number;
  state: ActivityState;
}
export function activityState(
  s: ActivitySample,
  at: number,
  c: Config,
): ActivityState {
  if (
    !s.visible ||
    !s.focused ||
    s.parserStatus !== "OK" ||
    s.kind !== "sample" ||
    at >= s.at + c.heartbeatStaleSeconds * 1000
  )
    return "background";
  if (s.generating) return "generating";
  if (s.lastKeyboard > 0 && at < s.lastKeyboard + 5000) return "typing";
  if (
    (s.lastInteraction > 0 &&
      at < s.lastInteraction + c.idleThresholdSeconds * 1000) ||
    (s.lastAssistantFinished > 0 &&
      at < s.lastAssistantFinished + c.readingGraceSeconds * 1000)
  )
    return "reading";
  return "idle";
}
export function integrate(
  s: ActivitySample,
  start: number,
  end: number,
  c: Config,
): { counters: Counters; segments: Segment[] } {
  const counters = zeroCounters(),
    segments: Segment[] = [];
  const cuts = [
    ...new Set([
      start,
      end,
      s.at + c.heartbeatStaleSeconds * 1000,
      s.lastKeyboard + 5000,
      s.lastInteraction + c.idleThresholdSeconds * 1000,
      s.lastAssistantFinished + c.readingGraceSeconds * 1000,
    ]),
  ]
    .filter((n) => n >= start && n <= end)
    .sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i],
      b = cuts[i + 1];
    if (b <= a) continue;
    const state = activityState(s, a, c),
      seconds = (b - a) / 1000;
    counters.wallClockSeconds += seconds;
    counters[`${state}Seconds`] += seconds;
    if (["typing", "reading", "generating"].includes(state))
      counters.activeSeconds += seconds;
    segments.push({ start: a, end: b, state });
  }
  return { counters, segments };
}
