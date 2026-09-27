# Spec Delta

## ADDED Requirements

### Requirement: Version dropdown and version selection

The system SHALL let the user select any stored version of an artifact from a dropdown in the artifact panel, and SHALL render the selected version's content.

#### Scenario: Select an older version
- **WHEN** an artifact has multiple versions and the user picks an older one from the version dropdown
- **THEN** the panel shows that version's content without removing the newer versions

### Requirement: Diff between any two versions

The system SHALL diff any two versions of an artifact side by side in a Monaco diff editor.

#### Scenario: Compare two versions
- **WHEN** the user chooses two versions to compare
- **THEN** a diff editor shows the differences between them, with the two versions identified

### Requirement: Revert creates a new version

The system SHALL offer a revert action that copies an older version's content forward as a new version, and SHALL never delete history.

#### Scenario: Revert appends rather than deletes
- **WHEN** the user reverts an artifact to an older version
- **THEN** a new version is appended containing the older content, and every prior version remains listed
