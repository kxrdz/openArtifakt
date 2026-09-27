-- 001_init.sql
-- Initial schema: conversations, messages, artifacts and their versions, the
-- tool-call log, and non-secret settings (§11).

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE messages (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  id TEXT NOT NULL,
  role TEXT NOT NULL,
  parts_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, seq)
);

CREATE TABLE artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  language TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (conversation_id, identifier)
);

CREATE TABLE artifact_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id INTEGER NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  incomplete INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (artifact_id, version)
);

CREATE TABLE tool_calls (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  name TEXT NOT NULL,
  args_json TEXT NOT NULL,
  result TEXT,
  is_error INTEGER NOT NULL DEFAULT 0,
  decision_json TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, call_id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, seq);
CREATE INDEX idx_artifacts_conversation ON artifacts(conversation_id);
CREATE INDEX idx_artifact_versions_artifact ON artifact_versions(artifact_id, version);
CREATE INDEX idx_tool_calls_conversation ON tool_calls(conversation_id, seq);
