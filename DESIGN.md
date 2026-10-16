# Cutover Desk design

A release coordinator compares a checklist with colleagues in a bright meeting room. White surfaces, charcoal text and restrained burnt-orange selection keep dense instructions readable on a shared screen.

## Palette

Use OKLCH tokens: background `oklch(1 0 0)`, secondary surface `oklch(0.975 0 0)`, ink `oklch(0.23 0 0)`, muted text `oklch(0.46 0 0)`, rule `oklch(0.87 0 0)`, primary `oklch(0.49 0.13 46)`. Semantic success and failure use labeled, high-contrast text with small icons. No gradient or decorative shadow system.

## Typography

System sans for the application. Monospace for IDs and timings. Fixed rem scale, compact labels and comfortable 1.5 body line height. Headings use modest negative tracking above 1.5rem, never below -0.04em.

## Layout

A narrow navigation rail, central runbook workspace and contextual step inspector. One header describes the active plan. Timeline and dependency views use the same underlying schedule. At narrow widths, navigation becomes a toolbar and the inspector follows the selected step list. Tables scroll within their own region.

## Components

Buttons and form controls use a consistent 6px radius. Primary actions are filled charcoal or burnt orange, secondary actions use a 1px border. Selection is a full subtle tinted background. Standard HTML form elements and an accessible native dialog for starting a rehearsal and importing a replacement document.

## Interaction

Transitions last 160ms and reflect selection or state changes. Reduced motion removes transitions. Do not animate page entry. Keep save errors persistent and preserve the current document when an import fails. Import and replacement require an explicit user action. No automatic command execution.
