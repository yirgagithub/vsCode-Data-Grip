# QueryDeck Architecture Redesign

## Status

Approved for planning on 2026-07-19.

## Objective

Restructure QueryDeck into a codebase that is easy to understand, change, test, and review while preserving every current feature and all user-visible behavior.

The redesign is a feature freeze and an architectural migration, not a product rewrite. Existing commands, settings, saved connections, query history, stored result sessions, UI behavior, and supported database engines remain compatible throughout the work. Delivery occurs through staged pull requests, and `main` must remain releasable after every merge.

## Current Problems

The codebase has several oversized orchestration and UI files, including `src/extension.ts`, `TableDataPanel.ts`, `QueryMapProvider.ts`, and `ConnectionEditorPanel.ts`. Responsibilities such as command registration, business rules, persistence, driver behavior, presentation, and lifecycle management are often difficult to distinguish.

The current technical-layer folders provide some organization, but feature behavior crosses those layers through concrete imports and shared types. A reviewer cannot reliably understand or change one capability without tracing a large portion of the extension. Splitting large files is necessary, but splitting alone would leave these dependency and ownership problems intact.

## Chosen Approach

Use a pragmatic feature-oriented modular monolith. Target feature boundaries provide the architecture; targeted decomposition of giant files provides an early migration technique.

Strict Clean Architecture was rejected because applying its full ceremony everywhere would introduce unnecessary interfaces and indirection for a VS Code extension. A decomposition-only approach was rejected because it would treat file size without correcting dependency direction or feature ownership.

## Target Architecture

### `core/`

Contains only stable domain concepts and invariants shared across multiple features:

- lossless database values;
- identifiers and connection references;
- query and result contracts;
- cancellation concepts;
- the shared error taxonomy.

Core code has no dependency on VS Code, database client libraries, storage, webviews, the filesystem, or AI providers. A type belongs in `core/` only when multiple features genuinely require the same domain meaning.

### `features/`

Organized around user capabilities rather than technical categories. Initial feature boundaries are:

- connections;
- query execution;
- results;
- explorer and schema metadata;
- table data;
- import and export;
- query memory and history;
- AI assistance;
- diagnostics and query analysis;
- administration and session monitoring.

Each feature owns its use cases, feature-specific domain rules, ports, presenters, and tests. It exposes a small public entry point. Consumers may import that public API but may not deep-import feature internals.

### `adapters/`

Contains technology-specific implementations:

- PostgreSQL, Redshift, MySQL, SQL Server, Oracle, Snowflake, SQLite, and Redis drivers;
- VS Code commands, views, secrets, configuration, notifications, and lifecycle integration;
- persistence implementations and schema migrations;
- webview transport;
- filesystem and export implementations;
- AI provider implementations.

Adapters depend on feature or core contracts. Features never import concrete adapters.

### `app/`

Contains the composition root. It constructs adapters, injects them into feature use cases, registers commands and views, and owns application startup and shutdown.

`extension.ts` becomes a minimal VS Code entry point that delegates activation and deactivation to the composition root. It contains no feature business logic.

## Dependency Rules

Allowed dependency direction is:

`app -> adapters -> features -> core`

An adapter may implement a port declared by a feature. A feature may use core types and another feature's explicit public API. Core cannot depend outward. Circular feature dependencies are prohibited.

These rules will be enforced automatically through architecture tests or lint rules. Temporary compatibility facades are permitted only during migration. Each facade must be named, documented, covered by tests, and assigned to a later removal milestone.

## Component and Data Flow

Every user action follows one traceable path:

`VS Code command or webview event -> feature use case -> domain contract -> adapter -> result -> presenter`

- Commands and webview message handlers translate inputs and outputs only.
- Use cases coordinate behavior and depend on explicit ports such as `ConnectionRepository`, `DatabaseSession`, `ResultStore`, and `AiProvider`.
- Presenters translate typed outcomes into VS Code notifications, tree nodes, or typed webview messages.
- Cross-feature communication uses declared public APIs or small domain events. Deep imports into another feature are forbidden.
- Generic logic does not repeatedly branch on `databaseType`. Engine-specific behavior belongs to driver capabilities.

## Database Driver Design

Drivers implement capability-based contracts rather than requiring every engine to pretend it supports the same operations. Common query and lifecycle behavior remains uniform; optional capabilities such as schemas, execution plans, session monitoring, or table modification are explicit.

Database-client-specific values and errors are translated exactly once at the adapter boundary. Generic feature code receives canonical values and typed errors, never raw client-library behavior.

## Lossless Value Model

Database values must retain their database meaning and representation from the driver boundary through result grids, exports, MCP responses, query memory, and persisted result sessions.

Formatting is a presentation concern. It may change how a value is displayed, but it must not mutate the stored or transported value. Date, time, timestamp, numeric, binary, JSON, null, and engine-specific values require explicit contracts and cross-engine contract tests.

## Webview Design

Each webview uses a typed, versioned message protocol. Extension-side controllers, state, message routing, and presentation are separate responsibilities. UI code separates feature state and actions from focused visual components.

Large panels and providers will be decomposed without behavior changes. A single catch-all message switch or UI component must not become the new monolith after extraction.

## Persistence and Compatibility

Persistence formats are versioned. Readers remain compatible with all currently supported saved data. Changes to a persisted schema require an explicit migration and compatibility fixtures.

The following are behavioral contracts during the redesign:

- command identifiers and keybindings;
- configuration keys and semantics;
- connection and secret records;
- document-to-connection associations;
- query history and memory;
- pinned or persisted result sessions;
- webview behavior visible to users;
- supported database behavior.

## Error Handling and Observability

Use a small shared taxonomy:

- validation;
- authentication;
- connectivity;
- timeout or cancellation;
- unsupported capability;
- persistence;
- unexpected failure.

Adapters translate library-specific errors into this taxonomy once. Feature use cases return typed outcomes or throw typed application errors according to one documented convention. Presenters decide how errors appear to users.

Errors are never silently swallowed. Each handled failure is returned, shown, or logged with sufficient operation and connection context to diagnose it. Passwords, tokens, full connection strings, and sensitive query parameters are never logged.

Resource ownership is explicit. Queries, tunnels, database sessions, webviews, event subscriptions, and VS Code disposables have defined creation, cancellation, and cleanup paths.

## Testing Strategy

The test pyramid consists of:

1. fast domain and use-case unit tests;
2. shared adapter contract tests across every database engine;
3. persistence migration and backward-compatibility tests;
4. typed webview protocol and presenter tests;
5. focused integration tests for composition and lifecycle behavior;
6. a small set of real VS Code and live-database end-to-end tests.

Before migrating a feature, characterization tests capture its current observable behavior. The feature is refactored behind those tests. Obsolete paths are removed only after parity is demonstrated.

Every redesign pull request must pass architecture rules, type-checking, unit and integration tests, production build and package checks, and the relevant end-to-end coverage.

## Migration Strategy

Migration proceeds through complete vertical slices, not a bulk folder move.

### Stage 1: Safety Baseline

- inventory commands, settings, persistence formats, webview messages, and driver capabilities;
- add missing characterization and compatibility tests;
- establish architecture decision records and automated dependency checks;
- define canonical values, errors, cancellation, and lifecycle contracts.

### Stage 2: Composition Root

- extract registration and dependency construction from `extension.ts`;
- group command registration by feature;
- preserve all command identifiers and activation behavior;
- make ownership and disposal explicit.

### Stage 3: Data Path Foundations

- establish query execution and result contracts;
- migrate lossless value handling end to end;
- introduce capability-based driver ports and shared contract tests;
- version persistence boundaries and add compatibility fixtures.

### Stage 4: Feature Slices

Migrate one feature at a time, prioritizing high-coupling areas:

1. connections;
2. query execution;
3. results;
4. explorer and schema metadata;
5. table data and import/export;
6. query history and memory;
7. diagnostics, plans, and AI assistance;
8. administration and session monitoring.

Each slice includes its public API, use cases, ports, adapters, presenters, and tests. Large files are split as part of the feature being migrated, not as unrelated cleanup.

### Stage 5: Boundary Cleanup

- remove compatibility facades and deprecated internal paths;
- eliminate deep imports and remaining cross-feature cycles;
- verify documentation and architectural diagrams against the code;
- run the complete release and live-database matrix.

## Pull Request Rules

- One architectural objective per PR.
- No feature additions during the redesign freeze.
- Refactoring and behavior changes are not mixed.
- Behavior parity evidence is included in each PR description.
- Temporary code includes its planned removal stage.
- `main` remains buildable, testable, packageable, and releasable.
- Merging remains a deliberate user decision after CI and review.

## Completion Criteria

The redesign is complete when:

- every major capability has an explicit feature owner and public API;
- dependency direction is enforced automatically and has no exceptions;
- `extension.ts` is only an entry point;
- no giant controller, panel, provider, or component mixes unrelated responsibilities;
- database-specific branching is contained behind explicit capabilities;
- database values remain lossless across every output and persistence path;
- persistence compatibility tests cover all existing formats;
- errors, cancellation, cleanup, and logging follow the shared contracts;
- core behavior is covered primarily by fast tests, with E2E reserved for integration confidence;
- all existing features, commands, settings, persisted data, supported engines, and user-visible behavior remain intact;
- architecture documentation matches the implemented dependency graph.

File size is a signal, not the definition of good design. No universal line limit is imposed; automated checks instead prevent forbidden dependencies, cycles, and deep imports. Exceptionally large files require a documented reason and focused responsibility.

## Non-Goals

- adding product features;
- redesigning the UI or changing workflows;
- changing command identifiers or settings;
- replacing TypeScript, React, VS Code, or the supported database libraries without a separate decision;
- splitting QueryDeck into independently deployed services;
- pursuing architectural purity where a direct, well-tested implementation is clearer.
