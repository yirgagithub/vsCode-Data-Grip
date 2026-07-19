# ADR 0001: Feature-Oriented Modular Monolith

## Status

Accepted — 2026-07-19

## Context

QueryDeck's technical-layer folders and large orchestration and UI files make feature ownership and dependency direction difficult to see. The redesign must improve changeability, testing, and review while preserving commands, settings, persisted data, user-visible behavior, and supported database engines. The [approved architecture redesign spec](../../superpowers/specs/2026-07-19-querydeck-architecture-redesign-design.md) defines those compatibility constraints and the staged migration.

Two alternatives were rejected:

- Strict Clean Architecture would add unnecessary interfaces and indirection throughout a VS Code extension, even where a direct, well-tested implementation is clearer.
- File-splitting-only would reduce individual file sizes without correcting dependency direction, unclear feature ownership, or concrete cross-layer coupling.

## Decision

QueryDeck will use a pragmatic feature-oriented modular monolith with the dependency direction `app -> adapters -> features -> core`.

- `core` owns stable domain concepts and invariants shared by multiple features and has no outward dependencies.
- Each `features/<name>` module owns a user capability, including its use cases, feature-specific rules, ports, presenters, and tests. Other features may use only its public `index.ts` API.
- `adapters` owns technology-specific implementations for VS Code, database clients, persistence, webviews, files, and AI providers. Features do not import concrete adapters.
- `app` is the composition root and owns construction, registration, startup, and shutdown.

The machine-readable boundaries and temporary legacy allowances are defined in [`architecture/modules.json`](../../../architecture/modules.json) and enforced by `npm run check:architecture`.

## Consequences

Feature ownership and dependency direction become explicit and automatically reviewable. Cross-feature access must use public APIs, adapter details remain outside feature logic, and shared core concepts stay technology-independent.

The approach requires deliberate public APIs and dependency injection where a technology boundary exists. During migration, target modules and legacy folders will coexist, so temporary allowances must not be treated as permission for new legacy code. QueryDeck remains one deployable VS Code extension rather than a set of services.

## Migration

Migration proceeds as tested vertical slices, not as a bulk folder move. Legacy roots listed in `architecture/modules.json` remain temporarily permitted while characterization and compatibility tests protect existing behavior. Each slice introduces its feature API, use cases, ports, adapters, presenters, and tests before obsolete paths are removed. Temporary compatibility facades must be named, documented, tested, and assigned to a later removal milestone. The composition root and lossless query/result contracts are established before feature-by-feature migration; remaining allowances are removed only after behavior parity and full boundary enforcement are demonstrated.
