import { useState, type FormEvent } from "react";
import { parsePlan, type Plan, type Step } from "./domain/model";
export function StepEditor({
  plan,
  step,
  onSave,
  onCancel,
  onRemove,
}: {
  plan: Plan;
  step: Step;
  onSave: (step: Step) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(structuredClone(step));
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      parsePlan({
        ...plan,
        steps: plan.steps.some((s) => s.id === draft.id)
          ? plan.steps.map((s) => (s.id === draft.id ? draft : s))
          : [...plan.steps, draft],
      });
      onSave(draft);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <form className="editor" onSubmit={submit}>
      <div className="section-heading">
        <h2>
          {plan.steps.some((s) => s.id === step.id) ? "Edit step" : "Add step"}
        </h2>
        <span className="mono">{step.id}</span>
      </div>
      <label>
        Step title
        <input
          autoFocus
          value={draft.title}
          maxLength={120}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          required
        />
      </label>
      <div className="form-pair">
        <label>
          Owner
          <input
            value={draft.owner}
            maxLength={80}
            onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
            required
          />
        </label>
        <label>
          Minutes
          <input
            type="number"
            min={1}
            max={1440}
            value={draft.minutes}
            onChange={(e) =>
              setDraft({ ...draft, minutes: Number(e.target.value) })
            }
            required
          />
        </label>
      </div>
      <label>
        Step type
        <select
          value={draft.kind}
          onChange={(e) =>
            setDraft({ ...draft, kind: e.target.value as Step["kind"] })
          }
        >
          <option value="action">Action</option>
          <option value="gate">Decision gate</option>
        </select>
      </label>
      <fieldset>
        <legend>Prerequisites</legend>
        {plan.steps
          .filter((s) => s.id !== draft.id)
          .map((s) => (
            <label className="check-label" key={s.id}>
              <input
                type="checkbox"
                checked={draft.dependsOn.includes(s.id)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    dependsOn: e.target.checked
                      ? [...draft.dependsOn, s.id]
                      : draft.dependsOn.filter((id) => id !== s.id),
                  })
                }
              />
              {s.title}
            </label>
          ))}
      </fieldset>
      {(["instructions", "verification", "rollback"] as const).map((field) => (
        <label key={field}>
          {field === "instructions"
            ? "Instructions"
            : field === "verification"
              ? "Evidence to verify"
              : "Rollback review"}
          <textarea
            rows={3}
            value={draft[field]}
            maxLength={2000}
            required
            onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
          />
        </label>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="primary" type="submit">
          Save step
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {plan.steps.some((s) => s.id === step.id) && (
          <button className="danger-text" type="button" onClick={onRemove}>
            Remove step
          </button>
        )}
      </div>
    </form>
  );
}
