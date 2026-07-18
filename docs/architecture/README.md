# QueryDeck Architecture

QueryDeck is a feature-oriented modular monolith.

## Dependency Direction

`app -> adapters -> features -> core`

- `core` contains shared domain invariants and has no outward dependencies.
- `features/<name>` owns one user capability and exposes only `features/<name>/index.ts`.
- `adapters` implements feature ports for VS Code, databases, persistence, webviews, files, and AI providers.
- `app` constructs the application and owns startup and shutdown.

Legacy folders remain temporarily permitted while vertical slices migrate. New feature code must follow the target boundaries.

Run `npm run check:architecture` before committing.
