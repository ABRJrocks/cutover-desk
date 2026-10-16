import { topological, type Plan } from "./model";
export interface Timing {
  start: number;
  finish: number;
  slack: number;
  critical: boolean;
}
export function schedule(plan: Plan) {
  const ordered = topological(plan);
  const timings: Record<string, Timing> = {};
  for (const step of ordered) {
    const start = Math.max(
      0,
      ...step.dependsOn.map((id) => timings[id].finish),
    );
    timings[step.id] = {
      start,
      finish: start + step.minutes,
      slack: 0,
      critical: false,
    };
  }
  const duration = Math.max(...Object.values(timings).map((t) => t.finish));
  const latest: Record<string, number> = {};
  for (const step of [...ordered].reverse()) {
    const successors = ordered.filter((s) => s.dependsOn.includes(step.id));
    latest[step.id] = successors.length
      ? Math.min(...successors.map((s) => latest[s.id])) - step.minutes
      : duration - step.minutes;
    timings[step.id].slack = latest[step.id] - timings[step.id].start;
    timings[step.id].critical = timings[step.id].slack === 0;
  }
  const ownerOverlaps: { owner: string; first: string; second: string }[] = [];
  for (let i = 0; i < ordered.length; i++)
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i],
        b = ordered[j];
      if (
        a.owner.trim().toLocaleLowerCase() ===
          b.owner.trim().toLocaleLowerCase() &&
        timings[a.id].start < timings[b.id].finish &&
        timings[b.id].start < timings[a.id].finish
      ) {
        ownerOverlaps.push({ owner: a.owner, first: a.id, second: b.id });
      }
    }
  return {
    timings,
    duration,
    ownerOverlaps,
    margin: plan.windowMinutes - duration,
    ordered,
  };
}
