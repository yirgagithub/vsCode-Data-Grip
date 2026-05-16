# Design Audit: VS Code Data Grip

Date: 2026-05-15
Surface reviewed: SQL Results webview fixture
Classifier: App UI

## First Impression

The panel communicates **database workbench utility**. I notice a calm, native VS Code surface with a clear result grid and restrained colors. The first 3 things my eye goes to are: **Run**, **the result-set tab**, and **the table header**. That is mostly right: execution and inspection are the core tasks.

If I had to describe it in one word: **credible**.

## Inferred Design System

- Fonts: VS Code theme font via `--vscode-font-family`; appropriate for an extension webview.
- Colors: VS Code theme tokens; coherent and native-feeling.
- Layout: dense toolbar, tabs, result-set row, filter row, grid, status bar.
- Spacing: mostly 4px and 8px rhythm.
- Component style: utilitarian, flat, low ornamentation. This is correct for a database tool.

## Scores

- Design Score: B
- AI Slop Score: A

Category grades:
- Visual hierarchy: B
- Typography: B
- Spacing and layout: B
- Color and contrast: A
- Interaction states: B
- Responsive/narrow panel: B-
- Content quality: B
- AI slop: A
- Motion: B
- Performance feel: A

## Findings

### FINDING-001: Narrow panel controls clipped and wrapped awkwardly

Impact: Medium
Category: Responsive / Interaction States
Status: Fixed, verified

I notice the mobile-width panel clipped toolbar/status content and wrapped `5 visible` across two lines in a fixed-height row. In a VS Code extension this matters because panels are frequently narrow, even on desktop.

What changed:
- Toolbar, filter row, and status bar now scroll horizontally instead of clipping or wrapping.
- Filter-row metadata stays on one line.
- Buttons, inputs, and selects now have visible `focus-visible` outlines.
- Disabled buttons now use `cursor: not-allowed`.

Evidence:
- Before desktop: `.gstack/design-reports/results-desktop.png`
- Before mobile: `.gstack/design-reports/results-mobile.png`
- After mobile: `.gstack/design-reports/results-mobile-after.png`

Files changed:
- `src/webviews/results/app/styles.css`

Verification:
- `npm run build` passed.
- `npm run lint` passed.
- Browser fixture rendered with no console errors.

### FINDING-002: Toolbar labels are still text-heavy for icon-first command surfaces

Impact: Polish
Category: Interaction States / Visual Hierarchy
Status: Deferred

The toolbar reads clearly, but commands like `Pin`, `Copy`, `CSV`, and `JSON` consume horizontal space and make the narrow-panel view feel cramped. For a database workbench, icon-first controls with tooltips would scan faster.

Suggested fix:
Use codicon-style glyphs or a small icon set for pin, copy, CSV export, JSON export, and close. Keep text for the primary `Run` action and row-limit selector.

Deferred because:
This requires choosing an icon delivery approach for webviews. The current repo does not include an icon library.

### FINDING-003: Native VS Code surfaces still need live visual QA

Impact: Medium
Category: Coverage
Status: Deferred

The connection editor, Database explorer, and history quick-pick flows are native VS Code surfaces or extension-host webviews. They need visual inspection inside Extension Development Host.

Suggested manual pass:
- Add Connection webview: empty, editing, testing, success, error states.
- Results panel: completed, failed, empty, partial-row-limit states.
- Narrow panel widths: 320px, 480px, 720px.
- Light theme and dark theme.

## Quick Wins

1. Replace secondary toolbar text controls with icons and tooltips.
2. Add a one-line status/notice strip for partial row limits and database notices.
3. Create `DESIGN.md` with the native VS Code app-UI rules: dense, calm, token-driven, low ornamentation.

## Before / After

Design score: B- -> B
AI slop score: A -> A

The biggest improvement is narrow-panel behavior. The UI now degrades like a workbench panel instead of like a fixed desktop layout squeezed into a sidebar.

## PR Summary

Design review found 3 findings, fixed 1. Design score B- -> B, AI slop score A -> A.
