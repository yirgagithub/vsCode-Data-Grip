# Automatic Publish Version Bump Design

## Goal

Make each manual marketplace publish run automatically create and persist the next patch version before attempting publication.

## Workflow

1. The manual-only workflow checks out the selected `main` commit and verifies that it is running on `main`.
2. It installs dependencies, then runs `npm version patch --no-git-tag-version` so `package.json` and `package-lock.json` move together (for example, `0.0.13` to `0.0.14`).
3. It resolves the new version, then runs type-checking, build, unit tests, VSIX packaging, artifact upload, and secret validation.
4. If any pre-publish step fails, the runner exits without changing `main`.
5. Immediately before marketplace publication, the workflow configures the GitHub Actions author, commits only `package.json` and `package-lock.json`, and pushes that commit to `main`.
6. It publishes the exact VSIX to Visual Studio Marketplace and Open VSX.

## Permissions and concurrency

- The workflow uses `contents: write` so `GITHUB_TOKEN` can push the version commit.
- The existing publish concurrency group remains non-cancelling, preventing two publish runs from racing to claim the same version.
- The checkout step uses the `main` branch explicitly and fetches current history before the bump.
- A guarded push failure stops publication; it never publishes a version that was not recorded on `main`.

## Failure policy

- A failure before the version commit leaves `main` unchanged.
- A failure during or after either marketplace publish does not revert the version commit because one marketplace may already contain that release.
- If only one marketplace fails, the operator manually publishes the uploaded VSIX artifact to that marketplace.
- The next workflow run increments to the next patch version.

## Scope

- No version input and no automatic changelog editing.
- No tags or GitHub Releases.
- No automatic rollback after marketplace publication begins.

## Validation

Workflow contract tests cover write permission, automatic patch bump, pre-publish verification ordering, commit/push ordering, exact committed files, main-branch guard, and absence of rollback/version input behavior. YAML parsing, lint, and the full unit suite must pass.
