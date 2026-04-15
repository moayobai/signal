import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, contacts, callSessions } from './db.js';

describe('db', () => {
  let db: ReturnType<typeof initDb>;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('creates contacts table and upserts a contact', () => {
    const now = Date.now();
    db.insert(contacts).values({
      id: 'c1',
      name: 'James',
      company: 'Acme',
      createdAt: now,
      updatedAt: now,
    }).run();

    const rows = db.select().from(contacts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('James');
  });

  it('creates call_sessions table with FK to contacts', () => {
    const now = Date.now();
    db.insert(contacts).values({ id: 'c1', name: 'J', createdAt: now, updatedAt: now }).run();
    db.insert(callSessions).values({
      id: 's1',
      contactId: 'c1',
      platform: 'meet',
      callType: 'investor',
      startedAt: now,
    }).run();
    const rows = db.select().from(callSessions).all();
    expect(rows[0].contactId).toBe('c1');
  });
});
