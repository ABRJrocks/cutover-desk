# Workflow integration

## Adapt the example

Start from [payments-cutover.json](../examples/payments-cutover.json), import it, then edit the plan details and steps. Use stable step IDs for prerequisites. Display order is derived from dependencies; it is not a substitute for explicit prerequisites. At most 80 steps are accepted.

Each action or decision gate has an owner, integer duration, instructions, verification text and rollback review instructions. Owners are free-text labels, not authenticated users. Decision gates use the same human evidence model as actions. They do not provide approval enforcement or signatures.

## JSON document contract

```json
{
  "schemaVersion": 1,
  "plan": {
    "id": "my-cutover",
    "title": "My service cutover",
    "summary": "Rehearse the routing change and recovery decision.",
    "windowMinutes": 30,
    "steps": [
      {
        "id": "preflight",
        "title": "Confirm the baseline",
        "owner": "Release lead",
        "minutes": 5,
        "kind": "gate",
        "dependsOn": [],
        "instructions": "Review the release reference and contact roster.",
        "verification": "Record the release reference and named decision owner.",
        "rollback": "Hold the change before modifying any service."
      }
    ]
  },
  "run": null
}
```

IDs use 1 to 64 ASCII letters, digits, underscores or hyphens and must start with a letter or digit. Titles are at most 120 characters, owners 80 and long text fields 2000. Durations are 1 to 1440 minutes; the change window is 1 to 10080 minutes. Each dependency must reference another step. Self-dependencies, duplicate IDs, repeated dependencies, unknown fields and cycles are rejected. JSON files are bounded to 2 MiB.

A workspace export includes the plan snapshot and `run`, with a coordinator label and chronological events. Each event has a unique ID, timestamp, type, optional step ID and note. The state is reconstructed by replay, not imported from a trusted status field. A malformed or impossible history is rejected without replacing the current workspace. This is structural validation, not proof that the evidence happened or that the file was never edited.

Keep the JSON under version control if it belongs with release documentation. The app does not open a GitHub issue or send a report on your behalf. Use the Markdown export in your own review or change-management process.

## Rehearsal state machine

1. Start with a named coordinator. The run captures a snapshot of the plan.
2. A pending step becomes ready when every prerequisite has succeeded.
3. Starting a ready step records an event. Independent ready steps may run in parallel.
4. Completion requires an evidence note and unlocks dependents. Failure requires a note and pauses the entire rehearsal.
5. Resuming requires a decision note. Failed steps return to pending so they must be started again; the earlier failed attempt remains in the event history. Other already-running steps remain in progress.
6. Abort requires a decision note and closes the rehearsal. Completing all steps also closes it. Closed records cannot receive more events.

During a pause, no new step outcome can be recorded. Resume first if you need to record what happened to an already-running step. Resume does not mean an external system has recovered. The app never changes that system.

A run is limited to 2000 events and the document size limit. Export before starting a new run. Starting again or returning to planning requires an explicit confirmation in the app and replaces the current record. No multi-run archive is stored internally.

## Browser recovery

On a valid reload, the app restores the persisted workspace. If saved JSON is invalid, it enters a protected state with the sample visible and a clear recovery warning. The original saved text remains available for download. Importing a reviewed valid file is the explicit replacement path.

If local storage is unavailable or full, work stays in memory and a persistent warning directs the coordinator to export JSON. Do so before closing the tab. If a competing tab changes the document, the current copy is protected against a later stale write, and the coordinator can export it before reloading. Simultaneous writes cannot be made fully atomic with this storage mechanism; use one active tab.

## Hosting

The app has no server API. Any conventional static server can serve `dist/` at a dedicated path, since built asset URLs are relative. Do not add untrusted scripts to the same origin as a sensitive workspace. The supplied content security policy restricts scripts and connections to the app's origin and disables object embedding, base URL changes and form submission.

GitHub Actions builds and runs tests before publishing to Pages. Pull requests build artifacts but do not deploy. For your own fork, enable GitHub Pages with GitHub Actions as the build source. Internal hosting or localhost is preferable for non-public operational notes.
