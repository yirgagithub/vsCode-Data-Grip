# QueryDeck Technical Study Guide

This document is designed to help explain and defend QueryDeck in a technical interview. It describes the product as it exists today, the reasoning behind its design, the architecture problems that have been identified, and the staged redesign that is now protected by automated safety checks.

The most important rule when presenting the project is to distinguish current implementation from target architecture. QueryDeck is a working multi-database VS Code extension. It currently uses a layered modular-monolith structure with a large composition/orchestration file. The accepted redesign moves it toward a feature-oriented modular monolith, but only the safety baseline has been completed so far. That is a strength: the migration is deliberately incremental, compatibility-tested, and keeps `main` releasable.

## 1. The short explanation

QueryDeck is an AI-first SQL workbench that runs inside VS Code. It lets a developer connect to PostgreSQL, Redshift, MySQL, SQLite, SQL Server, Oracle, Redis, and Snowflake; browse schemas; execute queries; inspect and compare results; retain local query memory; use AI-assisted SQL tools; and expose safe, read-only database context to coding agents through MCP.

Its central product idea is that database work should live beside the code and AI tools a developer already uses. Instead of switching to a separate database IDE, the developer can move from source code to SQL, database metadata, results, query history, and agent assistance without leaving the editor.

The current application is a TypeScript VS Code extension with React-based result UI, database-specific driver adapters, local persistence through VS Code storage, and an MCP server. The architecture redesign is moving it from technical-layer folders and large orchestration files toward explicit feature ownership with the dependency direction:

```text
app -> adapters -> features -> core
```

## 2. The problem it solves

A developer working with a database usually has several fragmented contexts:

- application code in an editor;
- SQL in a database IDE;
- schema knowledge in an explorer;
- past queries in history or personal notes;
- query plans and performance information in separate tools;
- an AI coding agent that does not safely know the database schema.

QueryDeck brings these contexts together. The extension is not only a query runner. Its differentiator is the complete workbench loop:

1. Select or create a database connection.
2. Browse database objects and metadata.
3. Write SQL in a normal editor or a managed query console.
4. Execute the current statement, selection, or file.
5. Inspect result tabs, filters, sorting, charts, plans, and errors.
6. Retain searchable local query memory.
7. Use AI to explain, repair, or analyze SQL when configured.
8. Give agents constrained read-only access through MCP.

The design treats privacy and safety as product features. Passwords use VS Code SecretStorage, query memory remains local, production writes can require confirmation, read-only connections reject non-read-only SQL, and the MCP server accepts only read-only execution with row limits.

## 3. Technology choices

### TypeScript and the VS Code extension API

TypeScript fits the platform and provides a shared type system across commands, services, database adapters, persistence records, and webview messages. The extension host owns privileged operations such as filesystem access, secrets, database connections, editor state, commands, and notifications.

VS Code contributes the extension lifecycle, command registry, tree views, webview views, editor events, language providers, SecretStorage, workspace/global state, configuration, and packaging model.

### React for the result webview

The result grid has richer state than a native VS Code tree: multiple result sets, tabs, filters, sorting, charts, execution plans, column state, status, and messages. A React webview is appropriate for that interactive surface. Vite bundles the webview application separately from the extension-host bundle.

The important boundary is that React does not talk directly to a database. It sends typed messages to the extension host. The host validates/handles the action, performs privileged work, and sends updated state back.

### Database client libraries behind drivers

Each engine has different connection options, metadata catalogs, cancellation mechanisms, result representations, transaction semantics, and SQL dialect. QueryDeck isolates those differences behind `DatabaseDriver` implementations rather than spreading client-library calls through UI and service code.

### VS Code persistence

The extension uses the storage mechanism appropriate to each kind of data:

- passwords: `context.secrets`;
- connection metadata: `context.globalState`;
- selected connection and workspace-specific records: `context.workspaceState`;
- runtime connection/client objects: memory only.

This avoids writing passwords into ordinary JSON settings and keeps workspace-specific activity separate from reusable connection definitions.

### MCP for agent integration

The MCP server gives external coding agents a narrow tool interface for listing configured connections, inspecting schemas and DDL, searching query memory, explaining SQL, and running bounded read-only queries. It is a separate entry point (`dist/mcpServer.js`) and can receive passwords through environment-variable references rather than embedding them in the configuration file.

## 4. Current architecture

QueryDeck currently behaves as a modular monolith: one deployable extension contains all product capabilities, but code is separated into technical areas.

```text
package.json / VS Code
        |
        v
src/extension.ts
  |-- constructs stores, managers, services, providers, and panels
  |-- registers commands and language features
  |-- reacts to editor/workspace lifecycle events
  `-- coordinates user workflows
        |
        +--> services/       domain and application operations
        +--> database/       connection manager, executor, drivers
        +--> persistence/    VS Code state and secret adapters
        +--> explorer/       database tree model/provider
        +--> webviews/       results, query map, connections, tables
        +--> ai/             VS Code/OpenAI-compatible AI adapter
        +--> mcp/            safe agent-facing server and service
        `--> runtime/        lazy/native dependency loading
```

### The activation function as the current composition root

`src/extension.ts` is the VS Code entry point. During activation it:

- creates the logger and persistence stores;
- creates `ConnectionManager`, `QueryExecutor`, schema, memory, plan, profiling, and AI services;
- creates tree and webview providers;
- registers commands, SQL formatting, completion, code actions, hover, definition, and CodeLens providers;
- subscribes to editor, document, configuration, and connection events;
- coordinates query execution, cancellation, diagnostics, and UI refresh;
- stores disposables in `context.subscriptions` for lifecycle cleanup.

This is functional, but the file has become a large mixture of composition, event wiring, command presentation, and feature orchestration. It is the clearest example of why the redesign is needed.

### Strengths of the current architecture

- Database implementations are already behind a common interface.
- Many business operations are already extracted into focused services.
- Persistence is separated into small stores.
- Webview message types exist for the results surface.
- Extension-host privileges and webview rendering are separated.
- Unit tests and live-database tests cover a broad set of behaviors.
- The system is a single deployable unit, which is appropriate for a VS Code extension.

### Current limitations

- Feature behavior crosses multiple technical folders, so ownership is hard to see.
- `extension.ts` knows too many concrete components and workflows.
- `DatabaseDriver` currently requires a wide uniform interface, even when an engine may not naturally support every operation.
- Some panels/providers are large and combine controller, state, transport, and presentation responsibilities.
- Shared types in `src/types.ts` cover many unrelated capabilities.
- Concrete imports make isolated use-case testing and substitution harder than necessary.

The redesign addresses these boundaries without rewriting the product or changing user-visible behavior.

## 5. End-to-end query execution

Query execution is the best flow to explain in an interview because it crosses most architectural layers.

```text
keyboard/command
    -> SQL selection and connection resolution
    -> QueryExecutor
    -> ConnectionManager
    -> engine-specific DatabaseDriver
    -> database client
    -> QueryExecutionResult
    -> QueryResultTab
    -> ResultsPanelProvider
    -> typed webview message
    -> React result grid
```

### Step 1: resolve SQL and connection

A VS Code command such as execute-current-query or execute-selection begins in the extension host. QueryDeck determines the relevant SQL section or selected text and resolves which saved connection is associated with the document. Document-to-connection associations are persisted so a SQL file can reopen with the same context.

### Step 2: execute through `QueryExecutor`

`QueryExecutor.execute` is the central application-level operation. It:

1. validates that the connection exists;
2. connects lazily if necessary;
3. enforces a connection's read-only default;
4. requests confirmation for risky SQL when configured;
5. opens a manual transaction if required;
6. splits multi-statement SQL;
7. delegates execution to the selected driver;
8. applies result row limits;
9. converts driver results into one or more result sets;
10. records success, failure, or cancellation in query history/memory;
11. returns a serializable `QueryResultTab` for the UI.

The executor intentionally returns a result-tab model even for an execution failure. That gives the UI one consistent object for completed, failed, and cancelled states.

### Step 3: connection and driver selection

`ConnectionManager` owns the registry from `DatabaseType` to driver instance, the active connection map, transaction modes, selected connection, and SSH tunnel lifecycle. The manager retrieves the password only when needed and delegates client-specific work to the driver.

When connecting through SSH, the tunnel is opened before the database driver connects. If connection fails, the manager closes the tunnel and removes partial active state. Disconnect similarly closes both driver resources and the tunnel.

### Step 4: normalize database output

The driver returns the shared `QueryExecutionResult` contract: execution ID, fields, rows, row count, command, and duration. The executor wraps this in the richer UI/session model with source location, connection identity, result-set tabs, filters, sort state, transaction state, and timestamps.

### Step 5: render through a webview boundary

`ResultsPanelProvider` holds extension-side result state and communicates with the React webview using `ResultsToWebviewMessage` and `ResultsFromWebviewMessage` unions. The webview can request actions such as changing the active tab or filtering, but database access remains in the extension host.

The generated HTML uses a Content Security Policy with `default-src 'none'`, restricts fonts and styles to the webview source, and authorizes scripts with a per-render nonce. This reduces the impact of accidental script injection.

### Step 6: cancellation and cleanup

Running executions track connection ID, result tab, document, execution IDs, and whether cancellation was requested. Cancellation travels back through the connection-specific driver because engines expose different cancellation APIs. VS Code disposables, event emitters, panels, database sessions, and tunnels all need explicit lifecycle ownership.

## 6. Database abstraction

The current `DatabaseDriver` interface includes:

- lifecycle: test, connect, disconnect;
- transaction control: begin, commit, rollback, state;
- query execution, validation, explanation, and cancellation;
- schema/object metadata;
- active-session administration;
- table preview, DDL, definitions, and statistics.

Implementations exist for PostgreSQL, Redshift, MySQL, SQLite, SQL Server, Oracle, Redis, and Snowflake.

### Why use a driver boundary?

Without it, a query feature might contain repeated conditions such as `if postgres`, `if mysql`, and `if oracle`. That couples product behavior to client libraries and makes every feature change aware of every engine. A driver boundary localizes SQL dialect, result conversion, error details, metadata queries, and cancellation behavior.

### Why the redesign proposes capabilities

A single large interface implies every engine supports every operation equally. That is not true. Redis is structurally different from a relational engine; session monitoring, explain plans, materialized views, and table statistics vary widely.

The target model keeps a small common lifecycle/query contract and exposes optional capabilities, for example:

```ts
interface QueryCapability { /* execute and cancel */ }
interface SchemaCapability { /* schemas, tables, columns */ }
interface ExplainCapability { /* query plan */ }
interface SessionAdminCapability { /* inspect/cancel sessions */ }
```

A feature checks for a declared capability and can return a typed unsupported-capability outcome. This is clearer than empty methods, fake implementations, or database-type branching in generic code.

### Lossless values

Database values must retain meaning from the client boundary through UI, export, MCP, memory, and persisted sessions. Formatting a timestamp for display must not destroy its timezone/precision semantics in stored data. The same concern applies to high-precision numerics, binary values, JSON, null, dates, and engine-specific types.

The redesign therefore treats formatting as presentation and requires cross-engine contract tests for value transport. This is an example of an architectural invariant that matters more than file organization.

## 7. Persistence and compatibility

VS Code extensions can be upgraded while user state remains on disk. Refactoring a TypeScript type does not migrate previously persisted JSON automatically. For that reason, stored records are part of the product's compatibility surface.

Important keys include:

- `database.connections` in global state;
- connection passwords in SecretStorage using connection-specific secret keys;
- selected connection in workspace state;
- query history and query memory in workspace state;
- query-console and SQL-document associations;
- result tabs/sessions in workspace state;
- schema metadata cache records.

PR #25 adds representative persistence fixtures and compatibility tests. The tests load historical-shaped records through in-memory VS Code context doubles and verify that current readers preserve important fields and semantics.

This is more robust than relying only on current write/read round-trip tests. A round trip can pass even when both the writer and reader change incompatibly. A historical fixture anchors the old format independently of the current writer.

### Persistence rule for future changes

If a persisted schema changes:

1. assign or recognize a version;
2. keep readers compatible with supported historical data;
3. provide an explicit migration when necessary;
4. add a fixture representing the previous format;
5. test both migration and current behavior;
6. never store secrets in normal state.

## 8. Query memory and AI

Query history answers “what ran?” Query memory aims to answer “what useful work have I done before?” It enriches history with searchable metadata such as SQL text, connection name, source file, tables, columns, output columns, execution status, title, and summary.

`QueryMemoryService` coordinates history, memory storage, query consoles, connection context, search, and optional summarization. The search path remains local. AI summarization is optional and isolated behind an adapter.

The AI adapter can use VS Code language models or an OpenAI-compatible provider depending on configuration. Prompt construction explicitly avoids result-row values and secrets. A good architectural principle here is that AI is an optional adapter, not the owner of core query behavior. The extension remains usable when AI is unavailable.

### AI safety boundary

The useful rule to explain is data minimization:

- send only the SQL and metadata needed for the operation;
- do not send passwords, tokens, or full connection strings;
- avoid result-row values unless a future feature explicitly requires and discloses them;
- keep provider selection/configuration at the adapter boundary;
- treat generated SQL as a suggestion that still passes normal safety controls.

## 9. MCP design

MCP lets an agent call named tools instead of receiving unrestricted database credentials. QueryDeck's `AgentDatabaseService` owns the server-side operations and driver registry. The MCP transport registers tools and serializes their responses.

The critical safety behavior is enforced in the service, not only described in tool text:

- query execution checks `isReadOnlySql`;
- non-read-only statements are rejected;
- requested row counts are bounded;
- output rows are trimmed to the allowed maximum;
- passwords can be materialized from environment-variable names;
- connection/client lifecycle remains inside the service.

Enforcing policy below the transport layer matters. If a second transport or caller is added later, it cannot bypass the rule simply by skipping UI validation.

## 10. Security model

QueryDeck is a local developer tool, but it handles high-impact capabilities. Its practical threat model includes leaked credentials, accidental production writes, malicious/untrusted webview content, unsafe agent queries, sensitive logging, and abandoned database/tunnel resources.

Current mitigations include:

- VS Code SecretStorage for passwords;
- read-only connection defaults;
- SQL safety classification and optional modal confirmation;
- a separate MCP read-only check with row limits;
- Content Security Policy and nonce-authorized webview scripts;
- structured extension-host boundaries around privileged work;
- connection and SSH tunnel cleanup on failure/disconnect;
- avoidance of passwords in AI prompts;
- local storage for query history and memory.

Limitations should be stated honestly. SQL safety classification is a defense layer, not a formal SQL proof system. The safest production posture still includes database permissions with least privilege, read-only database users where appropriate, network restrictions, and backups.

## 11. Testing strategy

The repository uses several levels of evidence.

### Fast unit and characterization tests

Unit tests cover services, SQL parsing/classification, persistence stores, driver behavior, metadata, result formatting/filtering, query memory, commands, and architecture rules. Characterization tests are especially important during refactoring: they freeze observable behavior before internals move.

### Architecture tests

`architecture/modules.json` is a machine-readable description of target roots, dependency direction, legacy roots, and temporary allowances. `npm run check:architecture` checks imports against those rules. Dedicated tests cover the rule engine itself.

Architecture enforcement is valuable because documentation alone drifts. A forbidden dependency should fail in CI at the pull request where it is introduced.

### Public-surface compatibility

PR #25 freezes important package contribution surfaces in a fixture: commands, settings, views, activation events, and related public identifiers. A redesign can then reorganize internals without silently renaming a command or configuration key used by users, keybindings, or integrations.

### Persistence compatibility

Historical-shaped fixtures verify that saved connections, query memory/history, consoles, document bindings, result sessions, and other supported records remain readable.

### Live database tests

Docker-backed CI exercises PostgreSQL, MySQL, Redis, SQL Server, Oracle, and SQLite. This catches errors that mocks cannot: client negotiation, real catalog behavior, type conversion, dialect differences, and engine-specific lifecycle issues.

### End-to-end extension tests

VS Code extension-host tests verify activation and real workbench integration. Marketplace media capture is also an end-to-end workflow: it starts database containers, launches VS Code, seeds real profiles, and captures real product UI. Because it crosses GUI timing, Electron, extension activation, and several containers, it is slower and more environment-sensitive than unit tests.

### Build and package verification

The extension host and webview are compiled/bundled, runtime dependencies are copied, and VSIX packaging verifies that the artifact can be installed. A green unit suite is not enough if bundling or packaging omits a runtime asset.

## 12. CI/CD and release reasoning

The CI workflow runs on pushes and pull requests. It installs dependencies reproducibly with `npm ci`, runs the unit/architecture/build path, and executes live-engine jobs. The project also verifies E2E compilation, marketplace content/media, and packaging through its scripts and workflows.

The architectural migration follows these delivery rules:

- one architectural objective per PR;
- no unrelated feature work inside a refactor PR;
- behavior parity evidence in each PR;
- `main` remains releasable after every merge;
- temporary exceptions are explicit and have removal milestones;
- merge happens only after CI and deliberate review.

This is safer than a long-lived rewrite branch. Large rewrites accumulate conflicts, hide regressions until late, and make review nearly impossible. Vertical slices reduce blast radius and make rollback straightforward.

## 13. Architecture redesign

### Why redesign?

The problem is not that the extension is a monolith. A single deployable is appropriate. The problem is unclear ownership and dependency direction inside it. A developer changing query memory, for example, may need to trace a command in `extension.ts`, multiple services, stores, shared types, and UI providers.

Several oversized files are symptoms, but a file-splitting exercise alone would not solve the underlying coupling. Small files can still form an unstructured dependency graph.

### Chosen target: feature-oriented modular monolith

The target is:

```text
src/
  app/                 composition, startup, shutdown
  adapters/            VS Code, DB clients, persistence, webviews, AI, files
  features/
    connections/
    query-execution/
    results/
    explorer/
    table-data/
    import-export/
    query-memory/
    ai-assistance/
    diagnostics/
    administration/
  core/                stable cross-feature domain invariants
```

Each feature owns its use cases, feature-specific rules, ports, presenters, and tests. Other modules use its public `index.ts` API rather than deep-importing internals.

### Dependency direction

```text
app -> adapters -> features -> core
```

- `core` knows no VS Code API, database client, storage, webview, filesystem, or AI provider.
- `features` depend on core and declared ports, not concrete adapters.
- `adapters` implement feature ports using technology-specific APIs.
- `app` constructs everything and owns lifecycle.

This is dependency inversion applied selectively at real technology boundaries, not an interface for every class.

### Why not strict Clean Architecture?

Strict Clean Architecture could introduce many layers and interfaces even where a direct implementation is clear and stable. For a VS Code extension, that ceremony can slow navigation and increase maintenance without improving substitution or testing.

The pragmatic design uses ports where they isolate volatile technology—database clients, persistence, VS Code UI, files, and AI—and keeps simple pure logic direct.

### Why not microservices?

QueryDeck is installed and runs as one extension. Splitting it into network services would create deployment, versioning, latency, authentication, and operational costs without independent scaling requirements. Modular boundaries are needed; distributed deployment is not.

### Why not only split large files?

Splitting improves readability but does not answer:

- which feature owns a behavior;
- which direction dependencies may flow;
- what the public API is;
- whether a database detail has leaked into generic code;
- whether another feature can deep-import an internal helper.

The feature architecture answers those questions. Large files are then decomposed while migrating the feature that owns them.

## 14. What PR #25 actually delivers

PR #25 is the architecture safety baseline, not the full migration. It delivers:

- the approved redesign specification;
- an architecture map and accepted ADR;
- `architecture/modules.json` as machine-readable policy;
- an architecture checker and tests for its rule engine;
- CI enforcement of architecture rules;
- fixtures/tests that freeze the public VS Code extension surface;
- fixtures/tests that protect persisted record compatibility;
- documentation of temporary legacy allowances.

This ordering is deliberate. Before moving code, the project first builds a safety net around what must not change. That converts “preserve behavior” from an intention into executable checks.

The existing legacy folders remain allowed temporarily. Target modules fail closed: imports that violate the target dependency direction require an exact documented allowance. Same-feature internal dependencies are not treated as architectural cycles, while circular dependencies between separate features are rejected.

## 15. Planned migration sequence

The migration uses vertical slices:

1. **Safety baseline** — freeze public and persistence contracts; enforce architecture rules.
2. **Composition root** — reduce `extension.ts` to activation/deactivation delegation and feature registration.
3. **Data-path foundations** — define lossless values, typed errors, cancellation, result contracts, and driver capabilities.
4. **Feature slices** — migrate connections, query execution, results, explorer, table operations, memory, AI/diagnostics, and administration one at a time.
5. **Boundary cleanup** — remove compatibility facades and temporary allowances; verify the final dependency graph.

For each feature slice:

1. add characterization tests for current observable behavior;
2. define a small public feature API;
3. extract use cases and ports;
4. implement/adapt technology-specific code behind the ports;
5. move presentation and message translation to focused adapters/presenters;
6. switch the composition root to the new slice;
7. verify parity, live behavior, build, and packaging;
8. remove obsolete paths only when no consumers remain.

## 16. Error handling and observability

Current driver/client errors are often normalized into the shared query-error shape containing message, code, detail, hint, position, and location. The target design goes further with a small application taxonomy:

- validation;
- authentication;
- connectivity;
- timeout/cancellation;
- unsupported capability;
- persistence;
- unexpected failure.

Adapters translate library-specific errors once. Features work with application errors, and presenters decide whether the outcome becomes a result tab, notification, log entry, or retry prompt.

Useful logging context includes operation, engine/connection ID, elapsed time, and lifecycle stage. It must exclude passwords, tokens, full connection strings, and sensitive query parameters.

An important distinction is cancellation versus failure. A user cancellation should not be presented as an unexpected database error, while a database statement timeout should not automatically be misclassified as a user cancellation.

## 17. Tradeoffs and honest limitations

### Tradeoff: broad engine support versus perfectly uniform behavior

Supporting eight engines creates value but increases contract complexity. The capability model accepts that features differ instead of forcing false uniformity.

### Tradeoff: local state versus synchronization

Local query memory improves privacy and latency but does not automatically synchronize between machines. Cloud synchronization would require a separate privacy, identity, conflict-resolution, and encryption design.

### Tradeoff: webview power versus complexity

React enables a sophisticated grid, but creates a process/message boundary, separate build output, state synchronization concerns, and additional security responsibilities.

### Tradeoff: static SQL safety checks versus parser completeness

Regex/classifier-based defenses are useful but cannot understand every dialect and obfuscation. Database permissions remain the authoritative security boundary.

### Tradeoff: incremental migration versus temporary duplication

Vertical slices keep releases safe, but old and target structures coexist for a time. Explicit allowances and removal milestones prevent “temporary” compatibility code from becoming permanent.

### Limitation: the target architecture is not yet fully realized

Do not claim otherwise. The correct statement is: “I identified scaling problems in the current internal structure, selected a pragmatic target, and first implemented automated compatibility and dependency guardrails. The migration is staged so every PR remains reviewable and releasable.”

That answer demonstrates engineering judgment more strongly than claiming a risky rewrite is complete.

## 18. Strong interview answers

### “Why did you build this?”

I wanted database work to stay in the same environment as application code and AI-assisted development. Existing tools can execute SQL, but I wanted a local-first workflow connecting schema exploration, query results, searchable query memory, AI assistance, and safe agent access.

### “What was the hardest technical problem?”

A strong answer is cross-database consistency. Each client returns different types, errors, metadata, cancellation behavior, and dialect features. The solution was to isolate client behavior behind drivers, normalize results at the boundary, and test real engines rather than trusting mocks. The next architectural improvement is capability-based driver contracts so unsupported operations are explicit.

### “How does a query move through the system?”

Start from the command, resolve the SQL and document connection, call `QueryExecutor`, enforce read-only and production safety rules, connect lazily through `ConnectionManager`, delegate to the engine driver, normalize the result, record local history/memory, create a result-tab model, and send typed state to the React webview.

### “How do you store passwords?”

Connection metadata is stored in VS Code global state, but passwords are separated into SecretStorage under a connection-specific key. Runtime code materializes a password only when connecting or testing. MCP configuration can reference an environment variable instead of embedding a password.

### “How do you prevent destructive queries?”

There are layered controls: a connection can be read-only by default, risky statements on production can require modal confirmation, MCP enforces read-only SQL independently and limits rows, and production database accounts should still use least privilege. The SQL classifier is a guardrail, not a substitute for database authorization.

### “Why a modular monolith?”

The product has one deployment and lifecycle, so microservices would add operational complexity without a scaling benefit. The real need is internal module ownership and dependency direction. A feature-oriented modular monolith gives those boundaries while keeping packaging and debugging simple.

### “How are you refactoring safely?”

Before moving code I froze the public extension surface and historical persistence formats with fixtures, added architecture rules as code, and required them in CI. Each feature then migrates as a vertical slice behind characterization tests. Main remains releasable after every PR.

### “Why not rewrite it?”

A rewrite would put feature parity, persisted user data, and eight database engines at risk, and would be difficult to review. Incremental migration produces evidence continuously and allows rollback at each step.

### “How do you test multiple databases?”

Fast tests cover pure logic, stores, and adapter behavior. Docker-backed CI runs against real PostgreSQL, MySQL, Redis, SQL Server, Oracle, and SQLite instances. Extension-host E2E tests cover VS Code integration. Build and VSIX packaging test artifact completeness.

### “What would you improve next?”

First extract the composition root and group command registration by feature. Then establish lossless result values, typed error/cancellation contracts, and capability-based drivers before migrating query execution and results. These are central paths and provide the most leverage for later feature slices.

### “What did you learn?”

A good answer: architecture quality is not the number of folders or interfaces. It is whether ownership, dependency direction, data contracts, and lifecycle are explicit and testable. I also learned that compatibility fixtures should be added before refactoring persisted systems, because current round-trip tests cannot prove old data remains readable.

## 19. Questions to ask yourself while studying

Be able to answer these without notes:

1. Why does QueryDeck belong inside VS Code rather than a separate desktop application?
2. What runs in the extension host, and what runs in the webview?
3. Why can the webview not connect directly to a database?
4. How is a saved password different from saved connection metadata?
5. What happens when a disconnected connection receives a query?
6. Where are read-only and production safety rules enforced?
7. How does cancellation reach the correct database client?
8. Why are real live-database tests necessary?
9. What does a persistence fixture catch that a round-trip test misses?
10. Why are database capabilities preferable to a huge mandatory interface?
11. Why is the target a modular monolith rather than microservices?
12. What exactly did the safety-baseline PR change?
13. What remains legacy, and how will it be migrated?
14. What user-visible contracts must remain stable?
15. What are the most important security limitations?

## 20. Ten-to-fifteen-minute presentation outline

### Minute 0–2: problem and product

“QueryDeck is an AI-first SQL workbench inside VS Code. I built it to keep application code, SQL, schema context, query memory, results, and agent assistance in one local-first workflow.”

Show the database explorer, a SQL editor/query console, and results.

### Minute 2–5: one end-to-end workflow

Run a query and narrate the path:

```text
command -> executor -> connection manager -> driver -> database
        -> normalized result -> result tab -> React webview
```

Mention lazy connection, read-only/production checks, multi-statement support, history, and cancellation.

### Minute 5–7: cross-database architecture

Show the `DatabaseDriver` boundary and the supported engines. Explain why real engines require adapters and why the next version uses optional capabilities.

### Minute 7–9: privacy, AI, and MCP

Explain SecretStorage, local query memory, data-minimized AI prompts, and enforced MCP read-only access with row limits.

### Minute 9–12: engineering quality and redesign

Be explicit that the working system grew into large orchestration files. Explain the feature-oriented modular-monolith target, public APIs, dependency direction, and vertical-slice migration.

Show that the first PR established architecture checks, public-surface fixtures, persistence fixtures, and CI gates before moving code.

### Minute 12–15: tradeoffs and roadmap

Discuss one honest tradeoff—broad database support versus capability differences—and one next step—extracting the composition root. End with what you learned about making architecture rules executable.

## 21. Demo checklist

Prepare a deterministic local database and sample schema before the interview. Avoid relying on network access or a production environment.

- Install the exact VSIX you intend to show.
- Prepare one healthy connection and test it before the call.
- Keep a short query ready that returns visually understandable data.
- Prepare one multi-statement or parameterized example if time permits.
- Show schema exploration and object metadata.
- Show query results, filtering, or a second result tab.
- Show query memory/search with pre-existing examples.
- Demonstrate AI only if the provider is already configured and reliable.
- Treat MCP as an architectural explanation unless the agent demo is deterministic.
- Keep screenshots available in case screen sharing or the extension host fails.
- Close unrelated windows, credentials, connection strings, and private query history.
- Rehearse the 12-minute version so questions can use the remaining time.

## 22. Code-reading map

Read these files in this order:

1. `README.md` — product positioning and user workflows.
2. `package.json` — commands, views, settings, activation, scripts, and package surface.
3. `src/extension.ts` — current composition and orchestration.
4. `src/database/queryExecutor.ts` — query execution workflow and history behavior.
5. `src/database/connectionManager.ts` — driver registry, connection/tunnel lifecycle, transactions.
6. `src/database/drivers/DatabaseDriver.ts` — current cross-engine contract.
7. one driver, such as `src/database/drivers/postgresDriver.ts` — real adapter details.
8. `src/webviews/results/ResultsPanelProvider.ts` and `messages.ts` — extension/webview boundary.
9. `src/persistence/connectionStore.ts`, `queryMemoryStore.ts`, and `resultSessionStore.ts` — state ownership.
10. `src/mcp/agentDatabaseService.ts` and `src/mcp/server.ts` — safe agent integration.
11. `docs/architecture/README.md` and ADR 0001 — target dependency model.
12. `architecture/modules.json` and architecture tests — executable enforcement.
13. the architecture redesign spec — staged migration and completion criteria.

## Final framing

The strongest way to present QueryDeck is not “I built a database IDE with many features.” It is:

> I built a working multi-database developer tool, learned where broad capability and rapid growth created architectural pressure, and responded with an incremental redesign protected by real compatibility, architecture, live-database, build, and packaging checks.

That framing shows product thinking, platform knowledge, database engineering, security awareness, testing discipline, and the judgment to improve a live system without risking its users.
