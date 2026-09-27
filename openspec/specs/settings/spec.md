# settings Specification

## Purpose
Lets a developer view and change how OpenArtifact talks to a model — provider, model, base URL, API-key reference, context window and approval mode — through a settings drawer, with keys never revealed in the browser.

## Requirements

### Requirement: Settings drawer shows provider and model configuration

The system SHALL provide a settings drawer covering the provider, model, base URL, API-key reference, context window, capability flags and approval mode, with the current values shown and editable.

#### Scenario: Open and edit settings
- **WHEN** the user opens the settings drawer
- **THEN** the current provider, model, base URL, key-reference name and approval mode are shown and can be changed

### Requirement: Key references are masked and never sent to the browser

The system SHALL show API-key references by name only and SHALL never send a key value to the browser; a saved key SHALL appear masked.

#### Scenario: Key value is never exposed
- **WHEN** the settings drawer loads
- **THEN** it shows the key-reference name (or a masked placeholder) and no key value

### Requirement: Settings are persisted and applied

The system SHALL persist settings server-side and SHALL apply the saved provider, model and approval mode to subsequent turns without a server restart.

#### Scenario: Approval mode applies immediately
- **WHEN** the user changes the approval mode in settings
- **THEN** the next turn runs under the new approval mode

#### Scenario: Provider change applies to new conversations
- **WHEN** the user changes the provider or model in settings
- **THEN** subsequent turns use the new provider and model
