import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  linkedinUrl: text('linkedin_url'),
  company: text('company'),
  role: text('role'),
  notes: text('notes'),
  octamemId: text('octamem_id'),
  hubspotId: text('hubspot_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const callSessions = sqliteTable('call_sessions', {
  id: text('id').primaryKey(),
  contactId: text('contact_id'),
  platform: text('platform').notNull(),
  callType: text('call_type').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  durationMs: integer('duration_ms'),
  sentimentAvg: real('sentiment_avg'),
  userWords: integer('user_words'),
  prospectWords: integer('prospect_words'),
  talkRatio: real('talk_ratio'),
  longestMonologueMs: integer('longest_monologue_ms'),
});

export const transcriptLines = sqliteTable('transcript_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  speaker: text('speaker').notNull(),
  text: text('text').notNull(),
  timestamp: integer('timestamp').notNull(),
});

export const signalFrames = sqliteTable('signal_frames', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  promptType: text('prompt_type').notNull(),
  promptText: text('prompt_text').notNull(),
  confidence: real('confidence').notNull(),
  sentiment: integer('sentiment').notNull(),
  dangerFlag: integer('danger_flag').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const transcriptEmbeddings = sqliteTable('transcript_embeddings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  speaker: text('speaker').notNull(),
  text: text('text').notNull(),
  embedding: blob('embedding', { mode: 'buffer' }).notNull(),
});

export const upcomingMeetings = sqliteTable('upcoming_meetings', {
  id: text('id').primaryKey(),                          // {provider}:{eventId}
  provider: text('provider').notNull(),
  title: text('title').notNull(),
  startTime: integer('start_time').notNull(),
  endTime: integer('end_time').notNull(),
  attendees: text('attendees').notNull(),               // JSON-encoded CalendarAttendee[]
  meetingLink: text('meeting_link'),
  description: text('description'),
  detectedAt: integer('detected_at').notNull(),
});

export const callSummaries = sqliteTable('call_summaries', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().unique(),
  winSignals: text('win_signals').notNull(),
  objections: text('objections').notNull(),
  decisions: text('decisions').notNull(),
  followUpDraft: text('follow_up_draft').notNull(),
  scorecard: text('scorecard'),
  createdAt: integer('created_at').notNull(),
});

export type DB = BetterSQLite3Database<Record<string, never>>;

const DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, linkedin_url TEXT,
  company TEXT, role TEXT, notes TEXT, octamem_id TEXT, hubspot_id TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS call_sessions (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  platform TEXT NOT NULL, call_type TEXT NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER,
  duration_ms INTEGER, sentiment_avg REAL,
  user_words INTEGER, prospect_words INTEGER,
  talk_ratio REAL, longest_monologue_ms INTEGER
);
CREATE TABLE IF NOT EXISTS transcript_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
  speaker TEXT NOT NULL, text TEXT NOT NULL, timestamp INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES call_sessions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS signal_frames (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
  prompt_type TEXT NOT NULL, prompt_text TEXT NOT NULL, confidence REAL NOT NULL,
  sentiment INTEGER NOT NULL, danger_flag INTEGER NOT NULL, created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES call_sessions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS call_summaries (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE,
  win_signals TEXT NOT NULL, objections TEXT NOT NULL, decisions TEXT NOT NULL,
  follow_up_draft TEXT NOT NULL, scorecard TEXT, created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES call_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contacts_name_company ON contacts(name, company);
CREATE INDEX IF NOT EXISTS idx_call_sessions_contact ON call_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_started ON call_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_contact_started ON call_sessions(contact_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcript_lines_session ON transcript_lines(session_id);
CREATE INDEX IF NOT EXISTS idx_signal_frames_session ON signal_frames(session_id);
CREATE INDEX IF NOT EXISTS idx_call_summaries_session ON call_summaries(session_id);
CREATE TABLE IF NOT EXISTS transcript_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding BLOB NOT NULL,
  FOREIGN KEY(session_id) REFERENCES call_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_embeddings_session ON transcript_embeddings(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_session_chunk ON transcript_embeddings(session_id, chunk_index);
CREATE TABLE IF NOT EXISTS upcoming_meetings (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  title TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  attendees TEXT NOT NULL,
  meeting_link TEXT,
  description TEXT,
  detected_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_upcoming_meetings_start ON upcoming_meetings(start_time);
`;

const MIGRATIONS: Array<{ id: string; statements: string[] }> = [
  {
    id: '20260415_call_metrics_and_integrations',
    statements: [
      'ALTER TABLE call_sessions ADD COLUMN user_words INTEGER',
      'ALTER TABLE call_sessions ADD COLUMN prospect_words INTEGER',
      'ALTER TABLE call_sessions ADD COLUMN talk_ratio REAL',
      'ALTER TABLE call_sessions ADD COLUMN longest_monologue_ms INTEGER',
      'ALTER TABLE call_summaries ADD COLUMN scorecard TEXT',
      'ALTER TABLE contacts ADD COLUMN hubspot_id TEXT',
    ],
  },
];

function isBenignMigrationError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate column name|already exists/i.test(msg);
}

function applyMigrations(sqlite: Database.Database): void {
  const hasMigration = sqlite.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').pluck();
  const recordMigration = sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)');

  for (const migration of MIGRATIONS) {
    if (hasMigration.get(migration.id)) continue;
    for (const stmt of migration.statements) {
      try {
        sqlite.exec(stmt);
      } catch (err) {
        if (!isBenignMigrationError(err)) throw err;
      }
    }
    recordMigration.run(migration.id, Date.now());
  }
}

export function initDb(url: string): DB {
  const sqlite = new Database(url);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.exec(DDL);
  applyMigrations(sqlite);
  return drizzle(sqlite);
}
