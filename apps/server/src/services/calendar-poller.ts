/**
 * Background poller — every `intervalMs` (default 2 min), asks the configured
 * CalendarProvider for events in the next 15 minutes, upserts them into the
 * `upcoming_meetings` table, and prunes stale rows (start_time < now − 1h).
 *
 * Idempotent: the PK is `{provider}:{eventId}` so repeated polls update the
 * same row rather than duplicating it. Survives transient network errors —
 * providers catch internally and return [].
 */

import { sql } from 'drizzle-orm';
import type { CalendarProvider } from './calendar.js';
import { upcomingMeetings, type DB } from './db.js';

const DEFAULT_INTERVAL_MS = 120_000;   // 2 minutes
const WINDOW_MS = 15 * 60 * 1000;      // 15 minutes
const STALE_MS = 60 * 60 * 1000;       // prune rows older than 1h past start

export interface CalendarPollerOpts {
  provider: CalendarProvider;
  db: DB;
  intervalMs?: number;
  /** Optional logger — defaults to console. */
  logger?: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void };
}

export interface CalendarPollerHandle {
  stop: () => void;
}

export function startCalendarPoller(opts: CalendarPollerOpts): CalendarPollerHandle {
  const interval = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const log = opts.logger ?? {
    info: (m: string) => console.log(m),
    error: (m: string, err?: unknown) => console.error(m, err),
  };

  let stopped = false;
  let inFlight = false;

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const events = await opts.provider.getUpcomingEvents(WINDOW_MS);
      const now = Date.now();
      for (const ev of events) {
        const id = `${ev.provider}:${ev.id}`;
        const row = {
          id,
          provider: ev.provider,
          title: ev.title,
          startTime: ev.startTime,
          endTime: ev.endTime,
          attendees: JSON.stringify(ev.attendees),
          meetingLink: ev.meetingLink ?? null,
          description: ev.description ?? null,
          detectedAt: now,
        };
        opts.db.insert(upcomingMeetings).values(row)
          .onConflictDoUpdate({
            target: upcomingMeetings.id,
            set: {
              title: row.title,
              startTime: row.startTime,
              endTime: row.endTime,
              attendees: row.attendees,
              meetingLink: row.meetingLink,
              description: row.description,
              detectedAt: row.detectedAt,
            },
          })
          .run();
      }
      // Prune rows whose meeting started more than STALE_MS ago.
      opts.db.delete(upcomingMeetings)
        .where(sql`${upcomingMeetings.startTime} < ${now - STALE_MS}`)
        .run();
      if (events.length > 0) {
        log.info(`[SIGNAL] calendar poll: ${events.length} upcoming meeting(s)`);
      }
    } catch (err) {
      log.error('[SIGNAL] calendar poll failed:', err);
    } finally {
      inFlight = false;
    }
  };

  // Fire once immediately so the table is populated on startup.
  void tick();
  const handle = setInterval(() => { void tick(); }, interval);

  return {
    stop: () => {
      stopped = true;
      clearInterval(handle);
    },
  };
}
