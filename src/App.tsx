import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowSquareOut,
  ArrowCounterClockwise,
  Check,
  CheckCircle,
  Clock,
  ClockCounterClockwise,
  Export,
  Flag,
  GitBranch,
  ListChecks,
  LockSimple,
  Pause,
  PencilSimple,
  Play,
  Plus,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react";
import { decodeDocument, encodeDocument, markdown } from "./domain/document";
import { MAX_BYTES, parsePlan, type Document, type Step } from "./domain/model";
import {
  appendEvent,
  begin,
  readySteps,
  replay,
  rollbackReview,
} from "./domain/run";
import { schedule } from "./domain/schedule";
import { SAMPLE } from "./domain/sample";
import { download, load, save, STORAGE_KEY } from "./storage";
import { StepEditor } from "./StepEditor";
const storage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
};
type Tab = "sequence" | "timeline" | "record" | "rollback";
const time = (at: number) =>
  new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
function Elapsed({ from }: { from: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((now - from) / 1000));
  return (
    <span className="mono">
      {Math.floor(seconds / 60)
        .toString()
        .padStart(2, "0")}
      :{(seconds % 60).toString().padStart(2, "0")}
    </span>
  );
}
export function App() {
  const [initial] = useState(() => load(storage));
  const [document, setDocument] = useState<Document>(initial.document);
  const expected = useRef(initial.raw);
  const [storageError, setStorageError] = useState(initial.error);
  const [blocked, setBlocked] = useState(initial.blocked);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(document.plan.steps[0].id);
  const [tab, setTab] = useState<Tab>("sequence");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState<Step | null>(null);
  const [note, setNote] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [dialog, setDialog] = useState<
    "start" | "import" | "export" | "plan" | "planning" | "remove" | null
  >(null);
  const [imported, setImported] = useState<Document | null>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const plan = document.plan;
  const analysis = schedule(plan);
  const view = document.run ? replay(plan, document.run) : null;
  const phase = view?.phase ?? "planning";
  const step = plan.steps.find((s) => s.id === selected) ?? plan.steps[0];
  const canEdit = !document.run && !blocked;
  const ready = view
    ? readySteps(plan, view).map((s) => s.id)
    : plan.steps.filter((s) => !s.dependsOn.length).map((s) => s.id);
  const finished = Object.values(view?.states ?? {}).filter(
    (s) => s === "succeeded",
  ).length;
  const terminal = phase === "completed" || phase === "aborted";
  useEffect(() => {
    if (dialog) modal.current?.showModal();
    else modal.current?.close();
  }, [dialog]);
  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key === STORAGE_KEY || event.key === null) {
        setBlocked(true);
        setStorageError(
          "Another tab changed this workspace. Export your current copy, then reload to use the saved version.",
        );
      }
    }
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  function commit(next: Document, replace = false) {
    try {
      const validated = decodeDocument(encodeDocument(next));
      let previous = expected.current;
      if (replace) {
        try {
          previous = storage.getItem(STORAGE_KEY);
        } catch {
          previous = null;
        }
      }
      const result = save(storage, validated, previous);
      setStorageError(result.error);
      if (result.conflict) {
        setBlocked(true);
        return false;
      }
      expected.current = result.raw;
      setDocument(validated);
      setError("");
      setBlocked(false);
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    }
  }
  function action(type: Parameters<typeof appendEvent>[1], stepId?: string) {
    try {
      if (
        commit(
          appendEvent(
            document,
            type,
            ["pause", "resume", "abort"].includes(type)
              ? decisionNote
              : type === "start"
                ? ""
                : note,
            stepId,
          ),
        )
      ) {
        setNote("");
        setDecisionNote("");
        setMessage(
          type === "complete"
            ? "Evidence recorded. Prerequisites updated."
            : type === "fail"
              ? "Failure recorded. Rehearsal paused."
              : "Decision recorded.",
        );
      }
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      if (commit(begin(plan, String(data.get("coordinator"))))) {
        setDialog(null);
        setTab("sequence");
        setMessage(
          "Rehearsal started. No infrastructure commands are executed.",
        );
      }
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function updateStep(next: Step) {
    const steps = plan.steps.some((s) => s.id === next.id)
      ? plan.steps.map((s) => (s.id === next.id ? next : s))
      : [...plan.steps, next];
    if (commit({ ...document, plan: parsePlan({ ...plan, steps }) })) {
      setEditor(null);
      setSelected(next.id);
      setMessage("Plan updated.");
    }
  }
  function removeStep() {
    try {
      const next = parsePlan({
        ...plan,
        steps: plan.steps.filter((s) => s.id !== editor!.id),
      });
      if (commit({ ...document, plan: next })) {
        setSelected(next.steps[0].id);
        setEditor(null);
        setDialog(null);
        setMessage("Step removed.");
      }
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function editPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const next = parsePlan({
        ...plan,
        title: String(data.get("title")),
        summary: String(data.get("summary")),
        windowMinutes: Number(data.get("window")),
      });
      if (commit({ ...document, plan: next })) setDialog(null);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    setImported(null);
    setError("");
    try {
      if (file.size > MAX_BYTES)
        throw new Error("Document exceeds the two MiB import limit.");
      setImported(decodeDocument(await file.text()));
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function exportFile(kind: "document" | "plan" | "markdown" | "recovery") {
    try {
      if (kind === "recovery")
        download(
          "cutover-desk-recovery.txt",
          expected.current ?? "",
          "text/plain",
        );
      else if (kind === "markdown")
        download(`${plan.id}-report.md`, markdown(document), "text/markdown");
      else
        download(
          `${plan.id}-${kind}.json`,
          encodeDocument(
            kind === "plan" ? { ...document, run: null } : document,
          ),
          "application/json",
        );
      setMessage("Export downloaded. Keep this file as your backup.");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function status(s: Step) {
    if (!view) return "planned";
    const state = view.states[s.id];
    return state === "pending"
      ? ready.includes(s.id)
        ? "ready"
        : "waiting"
      : state;
  }
  function newStep() {
    setEditor({
      id: "step-" + crypto.randomUUID().slice(0, 8),
      title: "",
      owner: "",
      minutes: 5,
      kind: "action",
      dependsOn: [],
      instructions: "",
      verification: "",
      rollback: "",
    });
  }
  const tabs: [Tab, string, typeof ListChecks][] = [
    ["sequence", "Sequence", ListChecks],
    ["timeline", "Timeline", GitBranch],
    ["record", "Activity", ClockCounterClockwise],
    ["rollback", "Rollback review", ArrowCounterClockwise],
  ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <aside className="rail">
        <a className="brand" href="#workspace">
          <span className="brand-symbol">
            <GitBranch size={23} weight="bold" />
          </span>
          <span>
            Cutover
            <br />
            <strong>Desk</strong>
          </span>
        </a>
        <div className="rail-group">
          <span className="rail-caption">Workspace</span>
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "nav-item selected" : "nav-item"}
              onClick={() => {
                setTab(id);
                setEditor(null);
              }}
              title={label}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          <span className="local-dot" />
          Local workspace
          <p>
            Stored in this browser.
            <br />
            Export to keep a backup.
          </p>
          <a
            href="https://github.com/ABRJrocks/cutover-desk"
            target="_blank"
            rel="noreferrer"
          >
            Source & guide <ArrowSquareOut size={14} />
          </a>
          <small>v0.1.0 · No account required</small>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Cutover rehearsal</strong>
          </div>
          <div className="button-row">
            <button
              onClick={() => {
                setImported(null);
                setError("");
                setDialog("import");
              }}
            >
              <UploadSimple />
              Import
            </button>
            <button onClick={() => setDialog("export")}>
              <Export />
              Export
            </button>
          </div>
        </header>
        {storageError && (
          <div className="storage-warning" role="alert">
            <Warning size={22} />
            <div>
              <strong>
                {blocked ? "Workspace protection" : "Work is not saved"}
              </strong>
              <p>{storageError}</p>
              <div className="button-row">
                <button onClick={() => exportFile("document")}>
                  Export current JSON
                </button>
                {expected.current !== null && (
                  <button onClick={() => exportFile("recovery")}>
                    Export saved text
                  </button>
                )}
                {blocked && (
                  <button onClick={() => window.location.reload()}>
                    Reload saved copy
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        <main id="workspace" tabIndex={-1}>
          <section className="plan-heading">
            <div>
              <div className="phase-line">
                <span className={`phase-dot ${phase}`} />
                <span>
                  {phase === "planning"
                    ? "Plan & rehearse"
                    : phase === "active"
                      ? "Rehearsal in progress"
                      : phase === "completed"
                        ? "Rehearsal completed"
                        : phase === "aborted"
                          ? "Rehearsal aborted"
                          : "Rehearsal paused"}
                </span>
                <span className="divider-text">/</span>
                <span className="mono">{plan.id}</span>
              </div>
              <h1>{plan.title}</h1>
              <p>{plan.summary}</p>
            </div>
            <div className="plan-actions">
              {canEdit && (
                <button onClick={() => setDialog("plan")}>
                  <PencilSimple />
                  Edit plan
                </button>
              )}
              {(!document.run || terminal) && (
                <button
                  className="primary"
                  disabled={blocked}
                  onClick={() => {
                    setError("");
                    setDialog("start");
                  }}
                >
                  <Play weight="fill" />
                  {document.run ? "New rehearsal" : "Start rehearsal"}
                </button>
              )}
              {terminal && (
                <button
                  disabled={blocked}
                  onClick={() => setDialog("planning")}
                >
                  Return to planning
                </button>
              )}
            </div>
          </section>
          <section className="summary-strip" aria-label="Plan overview">
            <div>
              <span>Dependency estimate</span>
              <strong>
                {analysis.duration}
                <small> min</small>
              </strong>
            </div>
            <div>
              <span>Change window</span>
              <strong>
                {plan.windowMinutes}
                <small> min</small>
              </strong>
            </div>
            <div>
              <span>
                {analysis.margin >= 0 ? "Planning margin" : "Window overrun"}
              </span>
              <strong className={analysis.margin < 0 ? "danger-text" : ""}>
                {Math.abs(analysis.margin)}
                <small> min</small>
              </strong>
            </div>
            <div>
              <span>{view ? "Steps completed" : "Steps in plan"}</span>
              <strong>
                {view
                  ? `${finished} / ${plan.steps.length}`
                  : plan.steps.length}
                <small>{view ? " recorded" : " total"}</small>
              </strong>
            </div>
            {document.run && (
              <div>
                <span>
                  {terminal ? "Final status" : "Elapsed incl. pauses"}
                </span>
                <strong className="elapsed">
                  {terminal ? (
                    phase
                  ) : (
                    <Elapsed from={document.run.events[0].at} />
                  )}
                </strong>
              </div>
            )}
          </section>
          <div className="workbench">
            <section className="workspace-panel">
              <div className="panel-toolbar">
                <div>
                  <h2>{tabs.find((t) => t[0] === tab)![1]}</h2>
                  <span>
                    {tab === "sequence"
                      ? "Follow the dependencies, then record the evidence."
                      : tab === "timeline"
                        ? "Earliest starts based on dependencies, not owner availability."
                        : tab === "record"
                          ? "Human-reported events in chronological order."
                          : "Instructions for the steps touched during this rehearsal."}
                  </span>
                </div>
                {tab === "sequence" && (
                  <div className="button-row">
                    <label className="sr-only" htmlFor="step-filter">
                      Filter steps
                    </label>
                    <select
                      id="step-filter"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All steps</option>
                      <option value="critical">Critical path</option>
                      <option value="ready">
                        {view ? "Ready now" : "First steps"}
                      </option>
                    </select>
                    {canEdit && (
                      <button
                        onClick={newStep}
                        disabled={plan.steps.length >= 80}
                      >
                        <Plus />
                        Add step
                      </button>
                    )}
                  </div>
                )}
              </div>
              {analysis.margin < 0 && (
                <p className="inline-warning">
                  <Warning />
                  The dependency estimate exceeds the change window. Adjust the
                  plan before rehearsing.
                </p>
              )}
              {analysis.ownerOverlaps.length > 0 && (
                <div className="inline-warning">
                  <Warning />
                  <div>
                    <strong>Owner overlap in the estimated schedule</strong>
                    {analysis.ownerOverlaps.map((o, i) => (
                      <p key={i}>
                        {o.owner}: {o.first} and {o.second}. Review availability
                        before relying on the estimate.
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {tab === "sequence" && (
                <div className="step-list">
                  {analysis.ordered
                    .filter(
                      (s) =>
                        filter === "all" ||
                        (filter === "critical"
                          ? analysis.timings[s.id].critical
                          : ready.includes(s.id)),
                    )
                    .map((s) => (
                      <button
                        key={s.id}
                        className={`step-row ${selected === s.id ? "is-selected" : ""}`}
                        onClick={() => {
                          setSelected(s.id);
                          setEditor(null);
                          setNote("");
                          setError("");
                        }}
                        aria-pressed={selected === s.id}
                      >
                        <span className={`step-marker ${status(s)}`}>
                          {view?.states[s.id] === "succeeded" ? (
                            <Check weight="bold" />
                          ) : view?.states[s.id] === "running" ? (
                            <Play weight="fill" />
                          ) : view?.states[s.id] === "failed" ? (
                            <X weight="bold" />
                          ) : (
                            String(analysis.ordered.indexOf(s) + 1).padStart(
                              2,
                              "0",
                            )
                          )}
                        </span>
                        <span className="step-copy">
                          <strong>
                            {s.title}
                            {s.kind === "gate" && (
                              <Flag size={14} aria-label="Decision gate" />
                            )}
                          </strong>
                          <span>
                            {s.owner}
                            <i>·</i>
                            {s.dependsOn.length
                              ? `After ${s.dependsOn.join(", ")}`
                              : "No prerequisites"}
                          </span>
                        </span>
                        <span className="step-end">
                          <span className={`status-label ${status(s)}`}>
                            {status(s)}
                          </span>
                          <span className="mono">
                            {s.minutes} min
                            {analysis.timings[s.id].critical && (
                              <b title="On the critical path">CP</b>
                            )}
                          </span>
                        </span>
                        <ArrowRight className="row-arrow" size={17} />
                      </button>
                    ))}
                  {!analysis.ordered.some(
                    (s) =>
                      filter === "all" ||
                      (filter === "critical"
                        ? analysis.timings[s.id].critical
                        : ready.includes(s.id)),
                  ) && (
                    <div className="empty-state">
                      <LockSimple size={30} />
                      <h3>No steps ready</h3>
                      <p>
                        Complete prerequisites or resolve the paused rehearsal
                        to unlock the next steps.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {tab === "timeline" && (
                <div className="timeline-scroll">
                  <div className="timeline-key">
                    <span>
                      <i className="key-critical" />
                      Critical path
                    </span>
                    <span>
                      <i className="key-flexible" />
                      Has scheduling float
                    </span>
                    <span>Dependency-only estimate</span>
                  </div>
                  <div
                    className="timeline"
                    role="table"
                    aria-label="Dependency schedule"
                  >
                    {analysis.ordered.map((s) => (
                      <div className="timeline-row" role="row" key={s.id}>
                        <div role="cell">
                          <button onClick={() => setSelected(s.id)}>
                            {s.title}
                            <small>{s.owner}</small>
                          </button>
                        </div>
                        <div
                          className="track"
                          role="cell"
                          aria-label={`Starts at minute ${analysis.timings[s.id].start}, ends at minute ${analysis.timings[s.id].finish}, ${analysis.timings[s.id].slack} minutes float`}
                        >
                          <span
                            className={
                              analysis.timings[s.id].critical
                                ? "bar critical"
                                : "bar"
                            }
                            style={{
                              left: `${(analysis.timings[s.id].start / analysis.duration) * 100}%`,
                              width: `${(s.minutes / analysis.duration) * 100}%`,
                            }}
                          >
                            {s.minutes}m
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="timeline-axis">
                      <span>0 min</span>
                      <span>{Math.round(analysis.duration / 2)} min</span>
                      <span>{analysis.duration} min</span>
                    </div>
                  </div>
                </div>
              )}
              {tab === "record" &&
                (document.run ? (
                  <ol className="activity-list">
                    {document.run.events.map((e) => (
                      <li key={e.id}>
                        <span className={`activity-dot ${e.type}`} />
                        <div>
                          <div className="activity-title">
                            <strong>
                              {e.type === "begin"
                                ? "Rehearsal started"
                                : e.type === "complete"
                                  ? "Step completed"
                                  : e.type === "fail"
                                    ? "Step failed"
                                    : e.type === "start"
                                      ? "Step started"
                                      : `Rehearsal ${e.type === "resume" ? "resumed" : e.type === "pause" ? "paused" : "aborted"}`}
                            </strong>
                            <time dateTime={new Date(e.at).toISOString()}>
                              {time(e.at)}
                            </time>
                          </div>
                          {e.stepId && (
                            <p>
                              {plan.steps.find((s) => s.id === e.stepId)?.title}
                            </p>
                          )}
                          {e.note && <p className="evidence-note">{e.note}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="empty-state">
                    <ClockCounterClockwise size={32} />
                    <h3>Your rehearsal record starts here</h3>
                    <p>
                      Start a rehearsal, follow the sequence and record the
                      evidence. Decisions will appear here and in your exported
                      report.
                    </p>
                    <button
                      className="primary"
                      disabled={blocked}
                      onClick={() => setDialog("start")}
                    >
                      Start rehearsal
                    </button>
                  </div>
                ))}
              {tab === "rollback" &&
                (document.run && rollbackReview(plan, document.run).length ? (
                  <div className="rollback-list">
                    <p className="inline-warning">
                      <Warning />
                      Review against the actual system state. These instructions
                      do not execute or verify a rollback.
                    </p>
                    {rollbackReview(plan, document.run).map((s) => (
                      <article key={s.id}>
                        <span className="mono">{s.id}</span>
                        <h3>{s.title}</h3>
                        <p>{s.rollback}</p>
                        <small>Owner: {s.owner}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <ArrowCounterClockwise size={32} />
                    <h3>A recovery path before you need it</h3>
                    <p>
                      Every step has rollback review instructions. Once a step
                      is started, it appears here in reverse dependency order,
                      including failed and in-progress steps.
                    </p>
                  </div>
                ))}
              <footer className="panel-footer">
                <span>
                  <span className="critical-dot" />
                  {
                    analysis.ordered.filter(
                      (s) => analysis.timings[s.id].critical,
                    ).length
                  }{" "}
                  steps on critical path
                </span>
                <span>
                  {new Set(plan.steps.map((s) => s.owner)).size} named owners
                </span>
              </footer>
            </section>
            <aside className="inspector" aria-label="Selected step">
              {editor ? (
                <StepEditor
                  key={editor.id}
                  plan={plan}
                  step={editor}
                  onSave={updateStep}
                  onCancel={() => setEditor(null)}
                  onRemove={() => {
                    setError("");
                    setDialog("remove");
                  }}
                />
              ) : (
                <>
                  <div className="inspector-heading">
                    <span className="mono">{step.id}</span>
                    {canEdit && (
                      <button
                        className="icon-button"
                        aria-label="Edit selected step"
                        onClick={() => setEditor(step)}
                      >
                        <PencilSimple />
                      </button>
                    )}
                  </div>
                  <h2>{step.title}</h2>
                  <div className="inspector-meta">
                    <span>{step.owner}</span>
                    <span>
                      <Clock size={15} />
                      {step.minutes} min
                    </span>
                    {step.kind === "gate" && (
                      <span>
                        <Flag size={15} />
                        Decision gate
                      </span>
                    )}
                  </div>
                  <section>
                    <h3>Instructions</h3>
                    <p>{step.instructions}</p>
                  </section>
                  <section>
                    <h3>Evidence to verify</h3>
                    <p>{step.verification}</p>
                  </section>
                  <section>
                    <h3>Prerequisites</h3>
                    {step.dependsOn.length ? (
                      <ul className="prerequisites">
                        {step.dependsOn.map((id) => (
                          <li key={id}>
                            {view?.states[id] === "succeeded" ? (
                              <CheckCircle size={16} />
                            ) : (
                              <LockSimple size={16} />
                            )}
                            <button
                              onClick={() => {
                                setSelected(id);
                                setNote("");
                              }}
                            >
                              {plan.steps.find((s) => s.id === id)!.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">
                        No prerequisites. This step can start first.
                      </p>
                    )}
                  </section>
                  {document.run && (
                    <section className="record-action">
                      <h3>
                        {view?.states[step.id] === "running"
                          ? "Record the outcome"
                          : "Rehearsal action"}
                      </h3>
                      {view?.states[step.id] === "succeeded" ? (
                        <p className="success-text">
                          <CheckCircle />
                          Evidence recorded at {time(view.finished[step.id])}.
                        </p>
                      ) : view?.phase === "active" &&
                        ready.includes(step.id) ? (
                        <button
                          className="primary full"
                          disabled={blocked}
                          onClick={() => action("start", step.id)}
                        >
                          <Play weight="fill" />
                          Start this step
                        </button>
                      ) : view?.states[step.id] === "running" &&
                        view.phase === "active" ? (
                        <>
                          <label>
                            Evidence or failure note
                            <textarea
                              maxLength={2000}
                              rows={3}
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="What did you observe? Include a test or ticket reference."
                            />
                          </label>
                          <div className="button-row">
                            <button
                              className="primary"
                              disabled={blocked || note.trim().length < 3}
                              onClick={() => action("complete", step.id)}
                            >
                              <Check />
                              Complete
                            </button>
                            <button
                              className="danger-text"
                              disabled={blocked || note.trim().length < 3}
                              onClick={() => action("fail", step.id)}
                            >
                              Record failure
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="muted">
                          <LockSimple size={16} />
                          {view?.phase === "paused"
                            ? "Rehearsal paused. Record a decision below."
                            : terminal
                              ? "This rehearsal is closed. Export the record to keep it."
                              : "Waiting for prerequisites to succeed."}
                        </p>
                      )}
                    </section>
                  )}
                  {!document.run && (
                    <div className="rehearsal-hint">
                      <Play size={18} />
                      <p>
                        Start a rehearsal to record steps and evidence. Planning
                        does not execute any commands.
                      </p>
                    </div>
                  )}
                  {document.run && !terminal && (
                    <section className="decision-box">
                      <h3>
                        {phase === "paused"
                          ? "Resolve the pause"
                          : "Coordinator decisions"}
                      </h3>
                      <label>
                        Decision note
                        <textarea
                          value={decisionNote}
                          rows={2}
                          maxLength={2000}
                          onChange={(e) => setDecisionNote(e.target.value)}
                          placeholder="Record why the team is continuing, pausing or stopping."
                        />
                      </label>
                      <div className="button-row">
                        {phase === "paused" ? (
                          <button
                            className="primary"
                            disabled={blocked || decisionNote.trim().length < 3}
                            onClick={() => action("resume")}
                          >
                            <Play />
                            Resume & retry failed
                          </button>
                        ) : (
                          <button
                            disabled={blocked || decisionNote.trim().length < 3}
                            onClick={() => action("pause")}
                          >
                            <Pause />
                            Pause
                          </button>
                        )}
                        <button
                          className="danger-text"
                          disabled={blocked || decisionNote.trim().length < 3}
                          onClick={() => action("abort")}
                        >
                          Abort rehearsal
                        </button>
                      </div>
                    </section>
                  )}
                </>
              )}
              {error && !dialog && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </aside>
          </div>
          <div className="workspace-note">
            <LockSimple size={14} />
            <span>
              Local planning & human-reported evidence. Keep secrets out of
              notes. Export JSON to keep a backup.
            </span>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {message}
          </p>
        </main>
      </div>
      <dialog
        ref={modal}
        onCancel={() => {
          setDialog(null);
          setError("");
        }}
        onClose={() => setDialog(null)}
        aria-labelledby="dialog-title"
      >
        <div className="dialog-top">
          <h2 id="dialog-title">
            {dialog === "start"
              ? "Start a rehearsal"
              : dialog === "import"
                ? "Import a document"
                : dialog === "export"
                  ? "Export your workspace"
                  : dialog === "plan"
                    ? "Edit plan details"
                    : dialog === "remove"
                      ? "Remove this step?"
                      : "Return to planning?"}
          </h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={() => {
              setDialog(null);
              setError("");
            }}
          >
            <X />
          </button>
        </div>
        {dialog === "start" && (
          <form onSubmit={start}>
            <p>
              This records a human-operated rehearsal. It does not execute
              commands or verify production changes.
            </p>
            {document.run && (
              <p className="inline-warning">
                Starting again replaces the current record. Export it first if
                you need to keep it.
              </p>
            )}
            <label>
              Coordinator name
              <input
                name="coordinator"
                required
                maxLength={80}
                autoFocus
                placeholder="Your name or role"
              />
            </label>
            <div className="button-row">
              <button className="primary" type="submit">
                Begin rehearsal
              </button>
              <button type="button" onClick={() => exportFile("document")}>
                Export current JSON
              </button>
            </div>
          </form>
        )}
        {dialog === "import" && (
          <div>
            <p>
              Import a Cutover Desk JSON document, up to 2 MiB. The current
              workspace changes only when you confirm replacement.
            </p>
            <label className="file-input">
              Choose JSON file
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => readFile(e.target.files?.[0])}
              />
            </label>
            {imported && (
              <div className="import-preview">
                <strong>{imported.plan.title}</strong>
                <p>
                  {imported.plan.steps.length} steps ·{" "}
                  {imported.run ? "Includes a rehearsal record" : "Plan only"}
                </p>
              </div>
            )}
            <p>Export your current document first if you need to keep it.</p>
            <div className="button-row">
              <button
                className="primary"
                disabled={!imported}
                onClick={() => {
                  if (imported && commit(imported, true)) {
                    setSelected(imported.plan.steps[0].id);
                    setEditor(null);
                    setDialog(null);
                    setMessage("Document imported.");
                  }
                }}
              >
                Replace local document
              </button>
              <button onClick={() => exportFile("document")}>
                Export current JSON
              </button>
            </div>
            <div className="template-option">
              <span>Or start from the included example:</span>
              <button
                onClick={() => {
                  setImported(structuredClone(SAMPLE));
                  setError("");
                }}
              >
                Load sample for review
              </button>
            </div>
          </div>
        )}
        {dialog === "export" && (
          <div className="export-options">
            <p>
              Downloads stay on your device. Export JSON before clearing browser
              data or starting a new rehearsal.
            </p>
            <button onClick={() => exportFile("document")}>
              <strong>Workspace JSON</strong>
              <span>Plan, rehearsal and evidence. Import to resume.</span>
              <Export />
            </button>
            <button onClick={() => exportFile("plan")}>
              <strong>Plan JSON</strong>
              <span>Reusable runbook with the rehearsal removed.</span>
              <Export />
            </button>
            <button onClick={() => exportFile("markdown")}>
              <strong>Markdown report</strong>
              <span>Readable handoff for an issue, wiki or retrospective.</span>
              <Export />
            </button>
          </div>
        )}
        {dialog === "plan" && (
          <form onSubmit={editPlan}>
            <label>
              Plan title
              <input
                name="title"
                defaultValue={plan.title}
                maxLength={120}
                required
              />
            </label>
            <label>
              Summary
              <textarea
                name="summary"
                defaultValue={plan.summary}
                maxLength={2000}
                rows={3}
              />
            </label>
            <label>
              Change window in minutes
              <input
                name="window"
                type="number"
                defaultValue={plan.windowMinutes}
                min={1}
                max={10080}
                required
              />
            </label>
            <button className="primary" type="submit">
              Save plan details
            </button>
          </form>
        )}
        {dialog === "remove" && (
          <div>
            <p>
              Remove “{editor?.title}” from the plan. Steps that reference it
              must be updated first. Export the plan if you need a backup.
            </p>
            <button className="danger" onClick={removeStep}>
              Remove step
            </button>
          </div>
        )}
        {dialog === "planning" && (
          <div>
            <p>
              Keep this plan and clear the current rehearsal record. Export the
              record first if you need to retain it.
            </p>
            <div className="button-row">
              <button onClick={() => exportFile("document")}>
                Export current JSON
              </button>
              <button
                className="primary"
                onClick={() => {
                  if (commit({ ...document, run: null })) {
                    setDialog(null);
                    setTab("sequence");
                    setNote("");
                  }
                }}
              >
                Clear record & edit plan
              </button>
            </div>
          </div>
        )}
        {error && dialog && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </dialog>
    </div>
  );
}
