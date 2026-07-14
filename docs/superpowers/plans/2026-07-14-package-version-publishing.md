# Package-Version Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the committed package version the only version used by the manual marketplace publishing workflow.

**Architecture:** A workflow contract test will read the YAML as text and enforce the release invariants. The workflow will retain manual dispatch and its existing package-version resolver while removing the optional input and comparison step.

**Tech Stack:** GitHub Actions YAML, TypeScript, Vitest.

## Global Constraints

- Publishing remains manual-only.
- `package.json` is the single version source.
- The workflow never edits or commits version files.
- Duplicate marketplace versions fail and require a committed version bump.

---

### Task 1: Enforce and implement the package-only workflow

**Files:**
- Modify: `tests/packageScripts.test.ts`
- Modify: `.github/workflows/publish-extension.yml`

**Interfaces:**
- Consumes: `package.json.version` through the existing `Resolve package version` step.
- Produces: a manual workflow with no inputs and artifact names derived from `steps.package.outputs.version`.

- [ ] **Step 1: Add a failing workflow contract test**

Read `.github/workflows/publish-extension.yml` and assert it contains `workflow_dispatch:` and the package resolver, but does not contain `inputs:`, `REQUESTED_VERSION`, `${{ inputs.version }}`, or `Verify requested version`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/packageScripts.test.ts -t "package.json as the only publish version"`

Expected: FAIL because the workflow still declares and compares the version input.

- [ ] **Step 3: Remove the input and verification step**

Change the trigger to `workflow_dispatch:` with no child inputs and delete the complete `Verify requested version` step. Leave the resolver, artifact naming, checks, packaging, and publish commands unchanged.

- [ ] **Step 4: Verify the workflow and tests**

Run:

```powershell
npm test -- tests/packageScripts.test.ts
npx --yes js-yaml .github/workflows/publish-extension.yml
npm run lint
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit and open an unmerged PR**

Commit the workflow and test, push `ci/package-version-publish`, open a PR, and wait for all GitHub checks. Do not run the publishing workflow and do not merge the PR.
