export interface Step {
  id: string;
  title: string;
  owner: string;
  minutes: number;
  kind: "action" | "gate";
  dependsOn: string[];
  instructions: string;
  verification: string;
  rollback: string;
}
export interface Plan {
  id: string;
  title: string;
  summary: string;
  windowMinutes: number;
  steps: Step[];
}
export type EventType =
  "begin" | "start" | "complete" | "fail" | "pause" | "resume" | "abort";
export interface RunEvent {
  id: string;
  at: number;
  type: EventType;
  stepId?: string;
  note: string;
}
export interface Run {
  id: string;
  operator: string;
  events: RunEvent[];
}
export interface Document {
  schemaVersion: 1;
  plan: Plan;
  run: Run | null;
}
export const MAX_BYTES = 2 * 1024 * 1024;
export class InputError extends Error {}
export function demand(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InputError(message);
}
export function object(
  value: unknown,
  keys: string[],
  path: string,
): Record<string, unknown> {
  demand(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object.`,
  );
  demand(
    Object.keys(value).every((key) => keys.includes(key)),
    `${path} has an unknown field.`,
  );
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  name: string,
  max = 2000,
  required = true,
): string {
  demand(
    typeof value === "string" &&
      value.length <= max &&
      (!required || value.trim().length > 0),
    `${name} must be ${required ? "nonempty " : ""}text, up to ${max} characters.`,
  );
  demand(
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    `${name} contains control characters.`,
  );
  return value;
}
export function identifier(value: unknown, name: string): string {
  demand(
    typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value),
    `${name} must be a 1 to 64 character identifier.`,
  );
  return value;
}
export function integer(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  demand(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max,
    `${name} must be an integer from ${min} to ${max}.`,
  );
  return value;
}
export function parsePlan(value: unknown): Plan {
  const p = object(
    value,
    ["id", "title", "summary", "windowMinutes", "steps"],
    "Plan",
  );
  const id = identifier(p.id, "Plan ID");
  const title = text(p.title, "Plan title", 120);
  const summary = text(p.summary, "Plan summary", 2000, false);
  const windowMinutes = integer(p.windowMinutes, "Change window", 1, 10080);
  demand(
    Array.isArray(p.steps) && p.steps.length >= 1 && p.steps.length <= 80,
    "A plan needs 1 to 80 steps.",
  );
  const steps: Step[] = p.steps.map((raw, index) => {
    const s = object(
      raw,
      [
        "id",
        "title",
        "owner",
        "minutes",
        "kind",
        "dependsOn",
        "instructions",
        "verification",
        "rollback",
      ],
      `Step ${index + 1}`,
    );
    demand(
      s.kind === "action" || s.kind === "gate",
      "Step kind must be action or gate.",
    );
    demand(
      Array.isArray(s.dependsOn) && s.dependsOn.length <= 79,
      "Dependencies must be an array of step IDs.",
    );
    const dependsOn = s.dependsOn.map((value) =>
      identifier(value, "Dependency"),
    );
    demand(
      new Set(dependsOn).size === dependsOn.length,
      "A dependency is repeated.",
    );
    return {
      id: identifier(s.id, "Step ID"),
      title: text(s.title, "Step title", 120),
      owner: text(s.owner, "Owner", 80),
      minutes: integer(s.minutes, "Duration", 1, 1440),
      kind: s.kind,
      dependsOn,
      instructions: text(s.instructions, "Instructions"),
      verification: text(s.verification, "Verification"),
      rollback: text(s.rollback, "Rollback instructions"),
    };
  });
  const ids = new Set(steps.map((s) => s.id));
  demand(ids.size === steps.length, "Step IDs must be unique.");
  for (const step of steps)
    for (const dependency of step.dependsOn) {
      demand(
        ids.has(dependency),
        `Step ${step.id} refers to missing dependency ${dependency}.`,
      );
      demand(
        dependency !== step.id,
        `Step ${step.id} cannot depend on itself.`,
      );
    }
  const plan = { id, title, summary, windowMinutes, steps };
  topological(plan);
  return plan;
}
export function topological(plan: Plan): Step[] {
  const remaining = new Map(plan.steps.map((s) => [s.id, s]));
  const ordered: Step[] = [];
  const done = new Set<string>();
  while (remaining.size) {
    const ready = [...remaining.values()].filter((s) =>
      s.dependsOn.every((id) => done.has(id)),
    );
    demand(
      ready.length,
      "Dependencies contain a cycle. Remove the circular dependency.",
    );
    for (const step of ready) {
      ordered.push(step);
      done.add(step.id);
      remaining.delete(step.id);
    }
  }
  return ordered;
}
