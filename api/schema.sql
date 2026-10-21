-- schema.sql · the LOCK IN database (SQLite). It replaced the hosted database 4.0 was first built on.
--
-- ONE DATABASE, TWO PLACES. The free plan allows 10 databases and the account already had 9, so the sandbox and
-- production share the database "trailer-load". Every name carries a prefix placeholder; api/render.py fills it with
-- lab_ for the sandbox and li_ for production. The Worker reads its prefix from TABLE_PREFIX and never touches the other.
-- Everything is IF NOT EXISTS, so a second run changes nothing.
--
-- WHO CAN DO WHAT (the Worker in api/lockin-api.js is the only door; nothing reads a table from a browser)
--   Anyone (no account):  sign the arcade board with three initials, read the boards, add to the anonymous daily totals.
--   A crew member:        no account. The crew's code, then a name + 4-digit PIN (a PIN crew) or the personal code the
--                         instructor handed out (a manual crew). The device keeps a random token; only its SHA-256 is
--                         stored. 5 wrong PINs lock that name for 15 minutes.
--   An instructor:        the only account: email + password, made on the dashboard, confirmed by email. Passwords are
--                         PBKDF2-SHA256 with a salt; sessions are random tokens stored as SHA-256. 5 wrong passwords
--                         lock the account for 15 minutes and email an unlock link.

-- ── THE ARCADE (public, initials only) ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS {P}arcade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,                                            -- UTC date, YYYY-MM-DD
  initials TEXT NOT NULL CHECK (length(initials) = 3 AND initials GLOB '[A-Z][A-Z][A-Z]'),
  mode TEXT NOT NULL CHECK (mode IN ('daily', 'shift')),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 400000),
  integrity INTEGER NOT NULL CHECK (integrity BETWEEN 0 AND 100),
  pieces INTEGER NOT NULL CHECK (pieces BETWEEN 0 AND 340),
  pack INTEGER NOT NULL CHECK (pack BETWEEN 0 AND 100),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS {P}arcade_board_idx ON {P}arcade (mode, day, score DESC);
CREATE INDEX IF NOT EXISTS {P}arcade_created_idx ON {P}arcade (created_at);

-- ── ANONYMOUS DAILY TOTALS (one number per event per day, nothing about anyone) ─────────────────────────────────────
-- site_visits keeps the running total and today's count in one row, so the daily cap costs no second write.
CREATE TABLE IF NOT EXISTS {P}counters (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL DEFAULT '',
  day_n INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO {P}counters (key, n) VALUES ('site_visits', 0);
CREATE TABLE IF NOT EXISTS {P}event_counts (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT '',
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, mode)
);

-- ── INSTRUCTORS (the only accounts) ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS {P}instructors (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT NOT NULL,
  pw_salt TEXT NOT NULL,
  pw_iter INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS {P}auth_sessions (
  token_hash TEXT PRIMARY KEY,
  instructor_id TEXT NOT NULL REFERENCES {P}instructors (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS {P}auth_sessions_who_idx ON {P}auth_sessions (instructor_id);
-- one-time links sent by email: confirm the address, reset the password, unlock the account.
-- A confirmation link carries the password it was made with, and confirming sets that password. So someone who signs
-- up first with another person's email cannot keep the account: the owner's own sign-up sends a link with the owner's
-- password, and only the owner can open it.
CREATE TABLE IF NOT EXISTS {P}auth_tokens (
  token_hash TEXT PRIMARY KEY,
  instructor_id TEXT NOT NULL REFERENCES {P}instructors (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verify', 'reset', 'unlock')),
  pw_hash TEXT,
  pw_salt TEXT,
  pw_iter INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS {P}auth_tokens_who_idx ON {P}auth_tokens (instructor_id, kind, created_at);

-- ── CREWS ───────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS {P}crews (
  code TEXT PRIMARY KEY,                                        -- the join code, lower case
  name TEXT NOT NULL,
  join_mode TEXT NOT NULL DEFAULT 'pin' CHECK (join_mode IN ('pin', 'manual')),
  owner_id TEXT NOT NULL REFERENCES {P}instructors (id) ON DELETE CASCADE,
  licensed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS {P}crews_owner_idx ON {P}crews (owner_id);
CREATE TABLE IF NOT EXISTS {P}crew_members (
  id TEXT PRIMARY KEY,
  crew_code TEXT NOT NULL REFERENCES {P}crews (code) ON DELETE CASCADE,
  name TEXT NOT NULL,                                           -- the name the instructor knows the person by
  pin_hash TEXT,                                                -- PIN crews: PBKDF2 of the 4-digit PIN; null until first join
  pin_salt TEXT,
  seat_code TEXT,                                               -- manual crews: the personal code, XXXX-XXXX
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  last_seen TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS {P}crew_members_name_idx ON {P}crew_members (crew_code, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS {P}crew_members_seat_idx ON {P}crew_members (crew_code, seat_code);
CREATE TABLE IF NOT EXISTS {P}crew_tokens (
  token_hash TEXT PRIMARY KEY,                                  -- SHA-256 hex of the token the device holds
  member_id TEXT NOT NULL REFERENCES {P}crew_members (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS {P}crew_tokens_member_idx ON {P}crew_tokens (member_id);
CREATE TABLE IF NOT EXISTS {P}crew_walls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL REFERENCES {P}crew_members (id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT '',
  wall_score INTEGER NOT NULL DEFAULT 0,
  pieces INTEGER NOT NULL DEFAULT 0,
  dur_s INTEGER NOT NULL DEFAULT 0,
  integrity INTEGER NOT NULL DEFAULT 0,
  density INTEGER NOT NULL DEFAULT 0,
  incidents INTEGER NOT NULL DEFAULT 0,
  collapses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS {P}crew_walls_member_idx ON {P}crew_walls (member_id, created_at);
CREATE TABLE IF NOT EXISTS {P}crew_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL REFERENCES {P}crew_members (id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT '',
  app_ver TEXT,
  started_at TEXT,
  ended_at TEXT,
  duration_s INTEGER,
  summary TEXT NOT NULL DEFAULT '{}',                           -- JSON
  incidents TEXT NOT NULL DEFAULT '[]',                         -- JSON
  events TEXT NOT NULL DEFAULT '[]',                            -- JSON: the timed move log
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS {P}crew_sessions_member_idx ON {P}crew_sessions (member_id, created_at);

-- ── THE SANDBOX'S OUTBOX ────────────────────────────────────────────────────────────────────────────────────────────
-- Where an email lands when no email sender is configured (the sandbox, before the sender account exists), so the
-- links can be tested. Production with a sender never writes here.
CREATE TABLE IF NOT EXISTS {P}outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
