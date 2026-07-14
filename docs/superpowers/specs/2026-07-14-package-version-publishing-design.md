# Package-Version Publishing Design

## Goal

Make `package.json` the single source of truth for manually publishing QueryDeck, so a release can only be published after its version is committed to the repository.

## Workflow behavior

- The `Publish Extension` workflow remains manual-only.
- `workflow_dispatch` has no version input.
- The workflow reads the release version from `package.json` and uses it for the VSIX filename and artifact name.
- `package-lock.json` must remain synchronized with `package.json`; `npm ci` provides the existing consistency check.
- The workflow does not modify or commit package files.
- The existing type-check, build, unit-test, packaging, secret validation, Visual Studio Marketplace publish, and Open VSX publish steps remain unchanged.

## Release process

Before publishing a new release, create and merge a version-bump change that updates `package.json`, `package-lock.json`, and the changelog. Then run the manual workflow from that merged commit.

If either marketplace rejects the release because that version already exists, the workflow must fail visibly. The operator must bump and commit a new version before retrying; there is no input override that can make repository metadata differ from the published extension.

## Validation

Tests will assert that the workflow exposes no version input, contains no requested-version comparison, and derives its artifact filename from `package.json`. The workflow YAML and repository checks must continue to pass.
