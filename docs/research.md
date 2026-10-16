# Research and scope

## A different workflow surface

Cutover Desk is a graphical rehearsal workbench. The problem is coordination: a migration plan must express sequence, ownership, durations, verification and rollback before a team attempts the real change.

Primary references:

- [AWS pre-cutover guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/pre-cutover-stage.html) recommends named owners, estimated durations, task sequence and rehearsals. This informs the plan model and dependency schedule.
- [AWS cutover guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html) distinguishes routing changes, validation and rollback decisions, including risks after new data arrives. The app records a human decision and shows rollback instructions; it does not attempt an automatic rollback.
- [Cutover's rehearsal documentation](https://help.cutover.com/en/articles/7101609-use-linked-runbooks-in-a-rehearsal-run) demonstrates that dependency-aware rehearsal is an established category. Cutover Desk is a small local alternative for a single coordinator, not a replacement for an enterprise orchestration platform.
- [MDN Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API) describes origin-scoped browser storage. Local persistence is a convenience, with explicit export and visible failure handling, not a backup or secure vault.

## Release boundaries

Plans are validated directed acyclic graphs. Critical-path estimates account for dependencies, not resource scheduling or actual infrastructure. Shared-owner overlaps are warnings. Rehearsals record human-reported state and evidence notes, not independently verified production facts. There is no command execution, team synchronization, authentication, compliance audit log or cloud document storage. JSON and Markdown are the integration boundary.
