# scaffold Specification

## Purpose
Defines the build and tooling foundation of the OpenArtifact monorepo so that any contributor or CI can run, verify, and extend the project with a small set of reproducible commands.

## Requirements

### Requirement: Monorepo layout

The repository SHALL be a pnpm workspace containing `apps/server`, `apps/web`, `packages/core`, and `packages/shared`, with strict TypeScript enabled in every workspace.

#### Scenario: Workspace discovery

- **WHEN** `pnpm install` is run at the repository root
- **THEN** all four workspaces are recognized and their dependencies are linked

#### Scenario: Strict typecheck

- **WHEN** `pnpm check` is run at the repository root
- **THEN** the TypeScript compiler runs with `strict: true` across every workspace and reports no errors

### Requirement: Development command

The repository SHALL provide a single `pnpm dev` command that starts the server and the web client together.

#### Scenario: Start both apps

- **WHEN** a developer runs `pnpm dev`
- **THEN** the server starts and the web client is served, both from the local machine

### Requirement: Verification command

The repository SHALL provide a single `pnpm check` command that runs typechecking, linting, unit tests, end-to-end tests, and the design check, and exits non-zero on any failure.

#### Scenario: Green check

- **WHEN** `pnpm check` is run on a clean checkout with no outstanding failures
- **THEN** every verification step passes and the command exits zero

### Requirement: Local server binds to loopback

The server SHALL bind to `127.0.0.1` only and serve the built web client.

#### Scenario: Loopback binding

- **WHEN** the server starts
- **THEN** it listens only on `127.0.0.1` and serves the web build at the root path

### Requirement: Continuous integration

A GitHub Actions workflow SHALL run `pnpm check` on pushes and pull requests to the default branch.

#### Scenario: CI verification

- **WHEN** a commit is pushed or a pull request is opened
- **THEN** the CI workflow installs dependencies and runs `pnpm check`
