CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT,
  summary TEXT,
  target_titles TEXT NOT NULL DEFAULT '[]',
  seniority TEXT,
  locations TEXT NOT NULL DEFAULT '[]',
  remote_pref TEXT,
  salary_min INTEGER,
  hourly_min INTEGER,
  employment_types TEXT NOT NULL DEFAULT '[]',
  skills TEXT NOT NULL DEFAULT '[]',
  avoid TEXT NOT NULL DEFAULT '{"companies":[],"industries":[],"keywords":[]}',
  bridge_mode INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'America/Denver',
  resume_text TEXT,
  resume_updated_at INTEGER,
  criteria_version INTEGER NOT NULL DEFAULT 1,
  extra TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY NOT NULL, source TEXT NOT NULL, source_job_id TEXT NOT NULL,
  company TEXT NOT NULL, title TEXT NOT NULL, location TEXT, remote INTEGER,
  employment_type TEXT NOT NULL DEFAULT 'unknown', salary_min INTEGER, salary_max INTEGER,
  currency TEXT, url TEXT NOT NULL, description_text TEXT, tags TEXT NOT NULL DEFAULT '[]',
  posted_at INTEGER, fetched_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, content_hash TEXT
);
CREATE UNIQUE INDEX jobs_source_job_idx ON jobs(source, source_job_id);
CREATE INDEX jobs_fetched_at_idx ON jobs(fetched_at);
CREATE INDEX jobs_employment_type_idx ON jobs(employment_type);

CREATE TABLE news_items (
  id TEXT PRIMARY KEY NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL,
  snippet TEXT, author TEXT, published_at INTEGER, fetched_at INTEGER NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]', score INTEGER
);
CREATE UNIQUE INDEX news_items_url_idx ON news_items(url);

CREATE TABLE fetch_runs (
  id TEXT PRIMARY KEY NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL,
  started_at INTEGER NOT NULL, finished_at INTEGER, status TEXT NOT NULL,
  items_upserted INTEGER NOT NULL DEFAULT 0, error TEXT
);

CREATE TABLE job_matches (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  fit_score INTEGER, score_source TEXT, score_detail TEXT, reasons TEXT NOT NULL DEFAULT '[]',
  criteria_version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', scored_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX job_matches_user_job_idx ON job_matches(user_id, job_id);
CREATE INDEX job_matches_user_score_idx ON job_matches(user_id, fit_score);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, company TEXT, title TEXT, email TEXT, linkedin_url TEXT, where_met TEXT,
  tags TEXT NOT NULL DEFAULT '[]', last_contacted_at INTEGER, follow_up_at INTEGER, extra TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX contacts_user_id_idx ON contacts(user_id);

CREATE TABLE notes (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL, subject_id TEXT, subject_label TEXT, kind TEXT NOT NULL DEFAULT 'note',
  title TEXT, body TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX notes_user_subject_idx ON notes(user_id, subject_type, subject_id);

CREATE TABLE saved_events (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, url TEXT, starts_at INTEGER, ends_at INTEGER, venue TEXT, city TEXT,
  source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'interested', notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX saved_events_user_start_idx ON saved_events(user_id, starts_at);

CREATE TABLE user_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, key)
);

CREATE TABLE ladder_assessments (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level INTEGER NOT NULL, level_p TEXT NOT NULL, dimension_scores TEXT NOT NULL,
  answers TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX ladder_assessments_user_created_idx ON ladder_assessments(user_id, created_at);

CREATE TABLE ladder_quests (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL, level INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'todo',
  evidence TEXT, completed_at INTEGER, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ladder_quests_user_quest_idx ON ladder_quests(user_id, quest_id);

CREATE TABLE api_usage (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api TEXT NOT NULL, units INTEGER NOT NULL, input_tokens INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX api_usage_user_api_created_idx ON api_usage(user_id, api, created_at);
