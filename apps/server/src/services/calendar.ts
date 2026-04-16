/**
 * Unified Calendar service — Google Calendar + Outlook/Microsoft Graph.
 *
 * Pre-call magic: polled by `calendar-poller.ts`, surfaces the user's next
 * meeting so the extension popup and dashboard can pre-load prospect context.
 *
 * Both providers use the OAuth refresh-token flow with credentials supplied
 * via env vars. If credentials are missing/placeholder, `createCalendarProvider`
 * returns null (no-op) — providers themselves also return an empty array on
 * credential-missing or transient errors, never throw.
 */

import {
  fetchWithTimeout,
  isBlank,
  refreshGoogleAccessToken,
} from './google-auth.js';

const API_TIMEOUT_MS = 10_000;

// ── Public types ────────────────────────────────────────────────────────

export interface CalendarAttendee {
  email: string;
  name?: string;
  isOrganizer?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: number; // unix ms
  endTime: number;
  attendees: CalendarAttendee[];
  meetingLink?: string;
  description?: string;
  provider: 'google' | 'outlook';
}

export interface CalendarProvider {
  /** Return events starting within the next `windowMs` milliseconds. */
  getUpcomingEvents(windowMs: number): Promise<CalendarEvent[]>;
}

// ── Link extraction ─────────────────────────────────────────────────────

const MEET_RE  = /https:\/\/meet\.google\.com\/[a-z0-9-]+/i;
const ZOOM_RE  = /https:\/\/[a-z0-9-]*\.?zoom\.us\/j\/[0-9]+(\?[^\s"<>]*)?/i;
const TEAMS_RE = /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+/i;

function scanMeetingLink(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.match(MEET_RE)?.[0] ?? text.match(ZOOM_RE)?.[0] ?? text.match(TEAMS_RE)?.[0];
}

// ── Google Calendar ─────────────────────────────────────────────────────

interface GoogleEventAttendee {
  email?: string;
  displayName?: string;
  organizer?: boolean;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: GoogleEventAttendee[];
  organizer?: { email?: string; displayName?: string };
  conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> };
  hangoutLink?: string;
}

function parseGoogleTime(t: { dateTime?: string; date?: string } | undefined): number {
  if (!t) return 0;
  if (t.dateTime) return Date.parse(t.dateTime);
  if (t.date) return Date.parse(`${t.date}T00:00:00Z`);
  return 0;
}

interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

class GoogleCalendarProvider implements CalendarProvider {
  constructor(private readonly cfg: GoogleCalendarConfig) {}

  async getUpcomingEvents(windowMs: number): Promise<CalendarEvent[]> {
    const accessToken = await refreshGoogleAccessToken({
      clientId: this.cfg.clientId,
      clientSecret: this.cfg.clientSecret,
      refreshToken: this.cfg.refreshToken,
    }, 'Google Calendar');
    if (!accessToken) return [];

    const now = Date.now();
    const timeMin = new Date(now).toISOString();
    const timeMax = new Date(now + windowMs).toISOString();
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
      `?timeMin=${encodeURIComponent(timeMin)}` +
      `&timeMax=${encodeURIComponent(timeMax)}` +
      `&singleEvents=true&orderBy=startTime&maxResults=50`;

    try {
      const res = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }, API_TIMEOUT_MS);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('[SIGNAL] Google Calendar list failed:', res.status, txt);
        return [];
      }
      const data = await res.json() as { items?: GoogleEvent[] };
      return (data.items ?? [])
        .map(ev => this.toEvent(ev))
        .filter((ev): ev is CalendarEvent => ev !== null);
    } catch (err) {
      console.error('[SIGNAL] Google Calendar fetch failed:', err);
      return [];
    }
  }

  private toEvent(ev: GoogleEvent): CalendarEvent | null {
    const startTime = parseGoogleTime(ev.start);
    const endTime = parseGoogleTime(ev.end);
    if (!startTime) return null;

    const organizerEmail = ev.organizer?.email?.toLowerCase();
    const attendees: CalendarAttendee[] = (ev.attendees ?? [])
      .filter(a => !!a.email)
      .map(a => ({
        email: a.email!.toLowerCase(),
        name: a.displayName,
        isOrganizer: !!a.organizer || (!!organizerEmail && a.email?.toLowerCase() === organizerEmail),
      }));
    // If organizer isn't in attendees, add them so we can filter by it later.
    if (organizerEmail && !attendees.some(a => a.email === organizerEmail)) {
      attendees.push({
        email: organizerEmail,
        name: ev.organizer?.displayName,
        isOrganizer: true,
      });
    }

    // Conference data first; fall back to hangoutLink; finally scan description.
    const conf = ev.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')
      ?? ev.conferenceData?.entryPoints?.[0];
    const meetingLink = conf?.uri ?? ev.hangoutLink ?? scanMeetingLink(ev.description);

    return {
      id: ev.id,
      title: ev.summary ?? '(no title)',
      startTime,
      endTime: endTime || startTime + 30 * 60 * 1000,
      attendees,
      meetingLink,
      description: ev.description,
      provider: 'google',
    };
  }
}

// ── Outlook / Microsoft Graph ───────────────────────────────────────────

interface OutlookCalendarConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tenantId: string;
}

interface OutlookAttendee {
  emailAddress?: { address?: string; name?: string };
  status?: { response?: string };
}

interface OutlookEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  attendees?: OutlookAttendee[];
  organizer?: { emailAddress?: { address?: string; name?: string } };
  onlineMeeting?: { joinUrl?: string };
  webLink?: string;
}

function parseOutlookTime(t: { dateTime?: string; timeZone?: string } | undefined): number {
  if (!t?.dateTime) return 0;
  // Graph returns either 'UTC' or an IANA zone. When timeZone is 'UTC' or absent
  // and the string lacks Z/offset, treat as UTC. Otherwise let Date.parse handle it.
  const s = t.dateTime;
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTz) return Date.parse(s + 'Z');
  return Date.parse(s);
}

async function refreshOutlookAccessToken(cfg: OutlookCalendarConfig): Promise<string | null> {
  if (isBlank(cfg.clientId) || isBlank(cfg.clientSecret) || isBlank(cfg.refreshToken)) {
    return null;
  }
  const tenant = cfg.tenantId && cfg.tenantId.trim() !== '' ? cfg.tenantId : 'common';
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  try {
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Calendars.Read offline_access',
    });
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }, API_TIMEOUT_MS);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[SIGNAL] Outlook token refresh failed:', res.status, txt);
      return null;
    }
    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    console.error('[SIGNAL] Outlook token refresh failed:', err);
    return null;
  }
}

class OutlookCalendarProvider implements CalendarProvider {
  constructor(private readonly cfg: OutlookCalendarConfig) {}

  async getUpcomingEvents(windowMs: number): Promise<CalendarEvent[]> {
    const accessToken = await refreshOutlookAccessToken(this.cfg);
    if (!accessToken) return [];

    const now = Date.now();
    const startDateTime = new Date(now).toISOString();
    const endDateTime = new Date(now + windowMs).toISOString();
    const url = 'https://graph.microsoft.com/v1.0/me/calendarview' +
      `?startDateTime=${encodeURIComponent(startDateTime)}` +
      `&endDateTime=${encodeURIComponent(endDateTime)}` +
      '&$orderby=start/dateTime&$top=50';

    try {
      const res = await fetchWithTimeout(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'outlook.timezone="UTC"',
        },
      }, API_TIMEOUT_MS);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('[SIGNAL] Outlook calendarview failed:', res.status, txt);
        return [];
      }
      const data = await res.json() as { value?: OutlookEvent[] };
      return (data.value ?? [])
        .map(ev => this.toEvent(ev))
        .filter((ev): ev is CalendarEvent => ev !== null);
    } catch (err) {
      console.error('[SIGNAL] Outlook calendarview failed:', err);
      return [];
    }
  }

  private toEvent(ev: OutlookEvent): CalendarEvent | null {
    const startTime = parseOutlookTime(ev.start);
    const endTime = parseOutlookTime(ev.end);
    if (!startTime) return null;

    const organizerEmail = ev.organizer?.emailAddress?.address?.toLowerCase();
    const attendees: CalendarAttendee[] = (ev.attendees ?? [])
      .filter(a => !!a.emailAddress?.address)
      .map(a => ({
        email: a.emailAddress!.address!.toLowerCase(),
        name: a.emailAddress?.name,
        isOrganizer: !!organizerEmail && a.emailAddress?.address?.toLowerCase() === organizerEmail,
      }));
    if (organizerEmail && !attendees.some(a => a.email === organizerEmail)) {
      attendees.push({
        email: organizerEmail,
        name: ev.organizer?.emailAddress?.name,
        isOrganizer: true,
      });
    }

    const body = ev.body?.content;
    const meetingLink = ev.onlineMeeting?.joinUrl ?? scanMeetingLink(body) ?? scanMeetingLink(ev.bodyPreview);

    return {
      id: ev.id,
      title: ev.subject ?? '(no title)',
      startTime,
      endTime: endTime || startTime + 30 * 60 * 1000,
      attendees,
      meetingLink,
      description: ev.bodyPreview || (body ? body.slice(0, 2000) : undefined),
      provider: 'outlook',
    };
  }
}

// ── Composite ───────────────────────────────────────────────────────────

class CompositeCalendarProvider implements CalendarProvider {
  constructor(private readonly providers: CalendarProvider[]) {}

  async getUpcomingEvents(windowMs: number): Promise<CalendarEvent[]> {
    const results = await Promise.all(
      this.providers.map(p =>
        p.getUpcomingEvents(windowMs).catch(err => {
          console.error('[SIGNAL] Calendar provider failed:', err);
          return [] as CalendarEvent[];
        }),
      ),
    );
    return results.flat().sort((a, b) => a.startTime - b.startTime);
  }
}

// ── Factory ─────────────────────────────────────────────────────────────

export interface CalendarProviderConfig {
  google?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
  };
  outlook?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    tenantId?: string;
  };
}

export function createCalendarProvider(config: CalendarProviderConfig): CalendarProvider | null {
  const providers: CalendarProvider[] = [];

  const g = config.google;
  if (g && !isBlank(g.clientId) && !isBlank(g.clientSecret) && !isBlank(g.refreshToken)) {
    providers.push(new GoogleCalendarProvider({
      clientId: g.clientId!,
      clientSecret: g.clientSecret!,
      refreshToken: g.refreshToken!,
    }));
  }

  const o = config.outlook;
  if (o && !isBlank(o.clientId) && !isBlank(o.clientSecret) && !isBlank(o.refreshToken)) {
    providers.push(new OutlookCalendarProvider({
      clientId: o.clientId!,
      clientSecret: o.clientSecret!,
      refreshToken: o.refreshToken!,
      tenantId: o.tenantId && o.tenantId.trim() !== '' ? o.tenantId : 'common',
    }));
  }

  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0];
  return new CompositeCalendarProvider(providers);
}
