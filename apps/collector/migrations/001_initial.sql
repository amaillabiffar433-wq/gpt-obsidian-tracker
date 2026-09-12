CREATE TABLE sessions (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL, conversation_id TEXT NOT NULL, title TEXT NOT NULL,
 started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL, wall_clock_seconds REAL NOT NULL DEFAULT 0,
 active_seconds REAL NOT NULL DEFAULT 0, typing_seconds REAL NOT NULL DEFAULT 0,
 reading_seconds REAL NOT NULL DEFAULT 0, generating_seconds REAL NOT NULL DEFAULT 0,
 idle_seconds REAL NOT NULL DEFAULT 0, background_seconds REAL NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN ('recording','completed','ignored')), summary_status TEXT NOT NULL DEFAULT 'pending',
 category TEXT NOT NULL DEFAULT '其他', payload TEXT NOT NULL
);
CREATE INDEX sessions_conversation ON sessions(conversation_id);
CREATE INDEX sessions_status ON sessions(status);
CREATE TABLE messages (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), conversation_id TEXT NOT NULL,
 source_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL,
 sequence INTEGER NOT NULL, hash TEXT NOT NULL,
 UNIQUE(conversation_id, source_id)
);
CREATE TABLE message_revisions (message_id TEXT NOT NULL REFERENCES messages(id), hash TEXT NOT NULL, content TEXT NOT NULL, observed_at INTEGER NOT NULL, PRIMARY KEY(message_id, hash));
CREATE TABLE session_messages (session_id TEXT NOT NULL REFERENCES sessions(id), message_id TEXT NOT NULL REFERENCES messages(id), PRIMARY KEY(session_id, message_id));
CREATE TABLE activity_events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE INDEX events_session ON activity_events(session_id, at);
CREATE TABLE activity_segments (session_id TEXT NOT NULL REFERENCES sessions(id), start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(session_id,start_at,end_at));
CREATE TABLE summaries (session_id TEXT PRIMARY KEY REFERENCES sessions(id), payload TEXT NOT NULL, provider TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE topics (name TEXT PRIMARY KEY);
CREATE TABLE session_topics (session_id TEXT NOT NULL REFERENCES sessions(id), topic TEXT NOT NULL REFERENCES topics(name), PRIMARY KEY(session_id,topic));
CREATE TABLE daily_stats (date TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE sync_records (id TEXT PRIMARY KEY, path TEXT NOT NULL, before_hash TEXT, after_hash TEXT NOT NULL, backup_path TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
