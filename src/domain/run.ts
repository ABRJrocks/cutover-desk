import {
  demand,
  identifier,
  integer,
  object,
  text,
  type Document,
  type Plan,
  type Run,
  type RunEvent,
  type EventType,
} from "./model";
export type StepState = "pending" | "running" | "succeeded" | "failed";
export type Phase = "active" | "paused" | "completed" | "aborted";
export interface RunView {
  phase: Phase;
  states: Record<string, StepState>;
  started: Record<string, number>;
  finished: Record<string, number>;
}
const TYPES: EventType[] = [
  "begin",
  "start",
  "complete",
  "fail",
  "pause",
  "resume",
  "abort",
];
export function replay(plan: Plan, run: Run): RunView {
  identifier(run.id, "Rehearsal ID");
  text(run.operator, "Coordinator", 80);
  demand(
    Array.isArray(run.events) &&
      run.events.length >= 1 &&
      run.events.length <= 2000,
    "A rehearsal needs 1 to 2000 events.",
  );
  const view: RunView = {
    phase: "active",
    states: Object.fromEntries(plan.steps.map((s) => [s.id, "pending"])),
    started: {},
    finished: {},
  };
  const ids = new Set<string>();
  let last = 0;
  for (let index = 0; index < run.events.length; index++) {
    const event = object(
      run.events[index],
      ["id", "at", "type", "stepId", "note"],
      "Event",
    );
    const id = identifier(event.id, "Event ID");
    demand(!ids.has(id), "Event IDs must be unique.");
    ids.add(id);
    const at = integer(event.at, "Event time", 0, 8_640_000_000_000_000);
    demand(at >= last, "Event times must be chronological.");
    last = at;
    demand(TYPES.includes(event.type as EventType), "Unknown event type.");
    const type = event.type as EventType;
    const note = text(
      event.note,
      "Evidence or decision",
      2000,
      type !== "start" && type !== "begin",
    );
    if (index === 0) {
      demand(
        type === "begin" && event.stepId === undefined,
        "The first event must start the rehearsal.",
      );
      continue;
    }
    demand(type !== "begin", "A rehearsal can only begin once.");
    demand(
      view.phase !== "completed" && view.phase !== "aborted",
      "A finished rehearsal cannot be changed.",
    );
    if (type === "pause" || type === "resume" || type === "abort") {
      demand(
        event.stepId === undefined,
        "A rehearsal decision cannot target a step.",
      );
      demand(
        note.trim().length >= 3,
        "Explain the decision in at least three characters.",
      );
      if (type === "pause") {
        demand(
          view.phase === "active",
          "Only an active rehearsal can be paused.",
        );
        view.phase = "paused";
      } else if (type === "resume") {
        demand(view.phase === "paused", "Only a paused rehearsal can resume.");
        for (const step of plan.steps)
          if (view.states[step.id] === "failed")
            view.states[step.id] = "pending";
        view.phase = "active";
      } else view.phase = "aborted";
      continue;
    }
    demand(
      view.phase === "active",
      "Resume the rehearsal before changing a step.",
    );
    const stepId = identifier(event.stepId, "Event step ID");
    const step = plan.steps.find((s) => s.id === stepId);
    demand(step, `Unknown event step ${stepId}.`);
    if (type === "start") {
      demand(
        view.states[stepId] === "pending",
        "Only a pending step can start.",
      );
      demand(
        step.dependsOn.every((id) => view.states[id] === "succeeded"),
        "Complete the prerequisites before starting this step.",
      );
      view.states[stepId] = "running";
      view.started[stepId] = at;
    } else {
      demand(
        view.states[stepId] === "running",
        "Start the step before recording its outcome.",
      );
      demand(
        note.trim().length >= 3,
        "Record evidence in at least three characters.",
      );
      view.states[stepId] = type === "complete" ? "succeeded" : "failed";
      view.finished[stepId] = at;
      if (type === "fail") view.phase = "paused";
      if (plan.steps.every((s) => view.states[s.id] === "succeeded"))
        view.phase = "completed";
    }
  }
  return view;
}
export function appendEvent(
  document: Document,
  type: Exclude<EventType, "begin">,
  note: string,
  stepId?: string,
  at = Date.now(),
): Document {
  demand(document.run, "Start a rehearsal first.");
  const event: RunEvent = {
    id: crypto.randomUUID(),
    at: Math.max(at, document.run.events.at(-1)!.at),
    type,
    note,
    ...(stepId ? { stepId } : {}),
  };
  const next = {
    ...document,
    run: { ...document.run, events: [...document.run.events, event] },
  };
  replay(next.plan, next.run);
  return next;
}
export function begin(plan: Plan, operator: string, at = Date.now()): Document {
  const run: Run = {
    id: crypto.randomUUID(),
    operator: operator.trim(),
    events: [{ id: crypto.randomUUID(), at, type: "begin", note: "" }],
  };
  replay(plan, run);
  return { schemaVersion: 1, plan: structuredClone(plan), run };
}
export function readySteps(plan: Plan, view: RunView) {
  return view.phase === "active"
    ? plan.steps.filter(
        (s) =>
          view.states[s.id] === "pending" &&
          s.dependsOn.every((id) => view.states[id] === "succeeded"),
      )
    : [];
}
export function rollbackReview(plan: Plan, run: Run) {
  const touched = new Set(
    run.events.filter((e) => e.type === "start").map((e) => e.stepId),
  );
  // Reverse dependency order is a review aid, never an executable rollback sequence.
  const ordered: typeof plan.steps = [];
  const visit = (id: string) => {
    if (ordered.some((s) => s.id === id)) return;
    const step = plan.steps.find((s) => s.id === id)!;
    step.dependsOn.forEach(visit);
    ordered.push(step);
  };
  plan.steps.forEach((s) => visit(s.id));
  return ordered.reverse().filter((s) => touched.has(s.id));
}
