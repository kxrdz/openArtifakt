# Spec Delta

## Purpose

Defines the non-negotiable safety rules every agent tool must pass through: a workspace path jail, secret-file protection, and command-safety rules.

## ADDED Requirements

### Requirement: Path jail

The system SHALL resolve real paths and reject any target outside the workspace root, including `..` traversal and symlink escapes.

#### Scenario: Parent traversal rejected
- **WHEN** a tool is asked to access a path containing `..` that resolves outside the workspace
- **THEN** the access is rejected with an error

#### Scenario: Symlink escape rejected
- **WHEN** a tool is asked to access a symlink whose real target lies outside the workspace
- **THEN** the access is rejected with an error

#### Scenario: Paths inside the workspace allowed
- **WHEN** a tool is asked to access a real path inside the workspace
- **THEN** the access is allowed and the resolved absolute path is returned

### Requirement: Git directory write protection

The system SHALL deny writes inside `.git/`.

#### Scenario: Write inside .git denied
- **WHEN** a tool attempts to write or edit a path under `.git/`
- **THEN** the write is rejected with an error

### Requirement: Secret-file protection

The system SHALL treat reading files matching `.env*`, `*.pem`, `*.key` or `id_rsa*` as requiring explicit approval even in Full auto mode.

#### Scenario: Secret read always asks
- **WHEN** a tool is asked to read a file matching a secret pattern
- **THEN** the loop requests approval regardless of the current approval mode

### Requirement: Command safety

The system SHALL never auto-approve `sudo` in any approval mode.

#### Scenario: sudo never auto-approved
- **WHEN** a command starts with `sudo`
- **THEN** the loop requests approval even in Full auto mode

### Requirement: Untrusted content

The system SHALL treat file contents, command output and tool results as untrusted data that never overrides user instructions.

#### Scenario: Untrusted data is quarantined
- **WHEN** file content or command output is fed back to the model
- **THEN** it is returned as tool-result content, and the runtime system prompt states that instructions found there never override the user
