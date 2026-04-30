import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, contacts, callSessions } from './db.js';

describe('db', () => {
  let db: ReturnType<typeof initDb>;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('creates contacts table and upserts a contact', () => {
    const now = Date.now();
    db.insert(contacts)
      .values({
        id: 'c1',
        name: 'James',
        company: 'Acme',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rows = db.select().from(contacts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('James');
  });

  it('creates call_sessions table with FK to contacts', () => {
    const now = Date.now();
    db.insert(contacts).values({ id: 'c1', name: 'J', createdAt: now, updatedAt: now }).run();
    db.insert(callSessions)
      .values({
        id: 's1',
        contactId: 'c1',
        platform: 'meet',
        callType: 'investor',
        startedAt: now,
      })
      .run();
    const rows = db.select().from(callSessions).all();
    expect(rows[0].contactId).toBe('c1');
  });

  it('tracks migrations and can reopen an existing database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'signal-db-'));
    const path = join(dir, 'signal.db');
    const first = initDb(path) as unknown as { $client: Database.Database };
    first.$client.close();

    const second = initDb(path) as unknown as { $client: Database.Database };
    const rows = second.$client
      .prepare('SELECT id FROM schema_migrations ORDER BY id')
      .all() as Array<{ id: string }>;
    const columns = second.$client.prepare('PRAGMA table_info(call_sessions)').all() as Array<{
      name: string;
    }>;

    expect(rows.map(r => r.id)).toContain('20260415_call_metrics_and_integrations');
    expect(columns.map(c => c.name)).toContain('talk_ratio');
    expect(second.$client.pragma('foreign_keys', { simple: true })).toBe(1);
    second.$client.close();
  });

  it('backs up file databases before applying pending migrations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'signal-db-backup-'));
    const path = join(dir, 'signal.db');
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, linkedin_url TEXT,
        company TEXT, role TEXT, notes TEXT, octamem_id TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE call_sessions (
        id TEXT PRIMARY KEY,
        contact_id TEXT,
        platform TEXT NOT NULL, call_type TEXT NOT NULL,
        started_at INTEGER NOT NULL, ended_at INTEGER,
        duration_ms INTEGER, sentiment_avg REAL
      );
      CREATE TABLE call_summaries (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE,
        win_signals TEXT NOT NULL, objections TEXT NOT NULL, decisions TEXT NOT NULL,
        follow_up_draft TEXT NOT NULL, created_at INTEGER NOT NULL
      );
    `);
    legacy.close();

    const backupDir = join(dir, 'migration-backups');
    const migrated = initDb(path, { backupDir, now: () => Date.UTC(2026, 3, 29) }) as unknown as {
      $client: Database.Database;
    };
    const files = readdirSync(backupDir);
    expect(files).toHaveLength(1);

    const backup = new Database(join(backupDir, files[0]), { readonly: true });
    const backupColumns = backup.prepare('PRAGMA table_info(call_sessions)').all() as Array<{
      name: string;
    }>;
    const migratedColumns = migrated.$client
      .prepare('PRAGMA table_info(call_sessions)')
      .all() as Array<{ name: string }>;

    expect(backupColumns.map(c => c.name)).not.toContain('talk_ratio');
    expect(migratedColumns.map(c => c.name)).toContain('talk_ratio');

    backup.close();
    migrated.$client.close();
  });
});
