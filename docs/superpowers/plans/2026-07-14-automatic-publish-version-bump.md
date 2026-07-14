# Automatic Publish Version Bump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically increment and persist QueryDeck's patch version during each successful pre-publish workflow run.

**Architecture:** Contract tests enforce the GitHub Actions ordering and safety properties. The workflow changes the package files in the runner, verifies the release, then pushes a two-file version commit to `main` before calling either marketplace.

**Tech Stack:** GitHub Actions YAML, npm version, Git, TypeScript, Vitest.

## Global Constraints

- Manual workflow only; no version input.
- Patch version increments automatically.
- Pre-publish failures do not change `main`.
- Marketplace failures do not roll back the recorded version.
- Only `package.json` and `package-lock.json` are committed.

---

### Task 1: Add safe automatic version bumping

**Files:**
- Modify: `.github/workflows/publish-extension.yml`
- Modify: `tests/packageScripts.test.ts`

**Interfaces:**
- Produces: `steps.package.outputs.version` and `steps.package.outputs.vsix` from the bumped package metadata.
- Consumes: `GITHUB_TOKEN` through `contents: write` for the guarded `main` push.

- [ ] Add a failing workflow contract test for permission, patch bump, ordering, two-file commit, direct main push, and no rollback.
- [ ] Run the focused test and observe failure against the current package-only workflow.
- [ ] Add explicit main checkout, `npm version patch --no-git-tag-version`, and the version commit/push step after all pre-publish checks and before both publish steps.
- [ ] Run focused tests, YAML parsing, lint, full tests, and `git diff --check`.
- [ ] Commit, push, open an unmerged PR, and watch CI. Do not run the publish workflow.
