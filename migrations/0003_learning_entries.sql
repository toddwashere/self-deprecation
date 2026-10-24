CREATE TABLE learning_entries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'reference',
  title TEXT NOT NULL,
  body TEXT,
  source_url TEXT,
  source_title TEXT,
  author TEXT,
  event_id TEXT REFERENCES saved_events(id) ON DELETE SET NULL,
  occurred_at INTEGER,
  tags TEXT NOT NULL DEFAULT '[]',
  takeaways TEXT NOT NULL DEFAULT '[]',
  follow_up_questions TEXT NOT NULL DEFAULT '[]',
  next_actions TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX learning_entries_user_occurred_idx
  ON learning_entries(user_id, occurred_at);
CREATE INDEX learning_entries_user_kind_idx
  ON learning_entries(user_id, kind);
CREATE INDEX learning_entries_user_pinned_idx
  ON learning_entries(user_id, pinned);
