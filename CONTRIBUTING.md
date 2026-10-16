# Contributing

Use Node 22.12+ or 24+ and npm. Install with `npm ci`, then run `npm run dev`. The app is React and TypeScript with a pure domain layer and a small local-storage adapter.

Before proposing a change:

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

Add a regression for the behavior being changed. Domain tests belong in `tests/`; browser workflows in `e2e/`. Keep imported data untrusted, preserve recovery paths and avoid promises of authenticated approvals or production verification. Do not introduce production command execution or a cloud storage dependency as an incidental feature.

Use focused commits and a pull request explaining the concrete workflow, before/after behavior and validation. Changes to the file contract require version handling and migration notes. No automatic migration is currently supplied.
