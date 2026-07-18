# QueryDeck Architecture

QueryDeck is a feature-oriented modular monolith.

## Dependency Direction

`app -> adapters -> features -> core`

- `core` contains shared domain invariants and has no outward dependencies.
- `features/<name>` owns one user capability and exposes only `features/<name>/index.ts`.
- `adapters` implements feature ports for VS Code, databases, persistence, webviews, files, and AI providers.
- `app` constructs the application and owns startup and shutdown.

Legacy folders may temporarily import target modules while vertical slices migrate. Target modules fail closed when importing legacy code: every temporary exception must be an exact `from`/`to` entry in `architecture/modules.json` with a rationale and removal milestone. New feature code must follow the target boundaries, and circular feature dependencies are prohibited.

Run `npm run check:architecture` before committing.
