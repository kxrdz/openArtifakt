# Spec Delta

## Purpose

Defines the seven tools an agent may call against a local workspace, their approval policies, and the guarantees every tool executor must uphold.

## ADDED Requirements

### Requirement: Read file tool

The system SHALL provide a `read_file` tool that reads a workspace file by relative path and returns its content with line numbers.

#### Scenario: Read a file with line numbers
- **WHEN** the agent calls `read_file` with a valid relative path inside the workspace
- **THEN** the result contains the file content with a line number prefix on each line

#### Scenario: Read a slice of a file
- **WHEN** the agent calls `read_file` with `startLine` and `endLine`
- **THEN** only the requested line range is returned, clamped to the file's bounds

#### Scenario: Missing file
- **WHEN** the agent calls `read_file` for a path that does not exist
- **THEN** the result is an error stating the file does not exist

### Requirement: List directory tool

The system SHALL provide a `list_directory` tool that returns a directory tree, respecting `.gitignore`, with a depth limit.

#### Scenario: List a directory tree
- **WHEN** the agent calls `list_directory` with a relative path and a depth
- **THEN** the result is a tree of entries up to the requested depth

#### Scenario: Respect gitignore
- **WHEN** the workspace has a `.gitignore` that excludes a path
- **THEN** the excluded path is omitted from the tree

### Requirement: Glob tool

The system SHALL provide a `glob` tool that finds files by a glob pattern relative to the workspace root.

#### Scenario: Match files by pattern
- **WHEN** the agent calls `glob` with a pattern such as `src/**/*.ts`
- **THEN** the result lists the matching relative paths

### Requirement: Search code tool

The system SHALL provide a `search_code` tool that searches file contents by regular expression, with a cap on results.

#### Scenario: Regex search
- **WHEN** the agent calls `search_code` with a pattern
- **THEN** the result lists matching files and lines, capped at a configured maximum

#### Scenario: Invalid pattern
- **WHEN** the agent calls `search_code` with an invalid regular expression
- **THEN** the result is an error describing the invalid pattern

### Requirement: Edit file tool

The system SHALL provide an `edit_file` tool that replaces an exact string in a file and fails helpfully when the string is absent or ambiguous.

#### Scenario: Exact-string replace
- **WHEN** the agent calls `edit_file` with an `oldString` that occurs exactly once and a `newString`
- **THEN** the file is updated with that single replacement

#### Scenario: String not found
- **WHEN** the agent calls `edit_file` with an `oldString` that does not occur in the file
- **THEN** the result is an error stating the string was not found, and the file is unchanged

#### Scenario: Ambiguous string
- **WHEN** the agent calls `edit_file` with an `oldString` that occurs more than once and `replaceAll` is not set
- **THEN** the result is an error stating the string is not unique, and the file is unchanged

#### Scenario: Replace all
- **WHEN** the agent calls `edit_file` with `replaceAll` set
- **THEN** every occurrence of `oldString` is replaced

### Requirement: Write file tool

The system SHALL provide a `write_file` tool that creates or fully rewrites a file.

#### Scenario: Create a new file
- **WHEN** the agent calls `write_file` for a path that does not exist
- **THEN** the file is created with the given content

#### Scenario: Rewrite an existing file
- **WHEN** the agent calls `write_file` for an existing path
- **THEN** the file is fully replaced with the given content

### Requirement: Execute command tool

The system SHALL provide an `execute_command` tool that runs a shell command, streams its stdout/stderr, and returns the exit code and output.

#### Scenario: Run a command
- **WHEN** the agent calls `execute_command` with a command
- **THEN** the command runs in the workspace and the result contains the exit code and combined output

#### Scenario: Command timeout
- **WHEN** a command exceeds its timeout
- **THEN** the whole process tree is killed and the result reports a timeout

#### Scenario: Working directory override
- **WHEN** the agent passes a `cwd`
- **THEN** the command runs with that working directory, resolved within the workspace jail

### Requirement: Tool result truncation

The system SHALL cap tool results at about 20,000 characters, keeping the head and tail with a clear truncation marker.

#### Scenario: Large output
- **WHEN** a tool result exceeds the cap
- **THEN** the result keeps the head and tail and contains a marker of the form `[... N lines truncated ...]`

### Requirement: Approval policies

The system SHALL require approval for edits, writes and commands by default, while reads, listing, glob and search run automatically.

#### Scenario: Read tools run without approval
- **WHEN** the agent calls `read_file`, `list_directory`, `glob` or `search_code`
- **THEN** the tool runs without requesting approval

#### Scenario: Mutating and command tools ask by default
- **WHEN** the agent calls `edit_file`, `write_file` or `execute_command` in ask mode
- **THEN** the loop pauses for approval before the tool runs
