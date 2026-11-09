#!/usr/bin/env node
/**
 * One-off Google OAuth helper for the Gmail and Google Calendar connectors.
 *
 * Usage:
 *   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node scripts/google-oauth.mjs
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-oauth.mjs --calendar
 *
 * Opens the consent page in your browser, captures the ?code= redirect on a
 * local loopback server, exchanges it for a refresh token, and prints the
 * refresh token so you can paste it into GMAIL_REFRESH_TOKEN (or
 * GOOGLE_REFRESH_TOKEN_CALENDAR with --calendar).
 *
 * In Google Cloud Console → OAuth 2.0 Client IDs, add this redirect URI:
 *   http://127.0.0.1:8421/oauth2callback
 */
import http from 'node:http';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const PORT = 8421;
const REDIRECT = `http://127.0.0.1:${PORT}/oauth2callback`;

const TARGETS = {
  gmail: {
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    idVar: 'GMAIL_CLIENT_ID',
    secretVar: 'GMAIL_CLIENT_SECRET',
    tokenVar: 'GMAIL_REFRESH_TOKEN',
  },
  calendar: {
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    idVar: 'GOOGLE_CLIENT_ID',
    secretVar: 'GOOGLE_CLIENT_SECRET',
    tokenVar: 'GOOGLE_REFRESH_TOKEN_CALENDAR',
  },
};
const target = TARGETS[process.argv.includes('--calendar') ? 'calendar' : 'gmail'];
const SCOPE = target.scope;

const clientId = process.env[target.idVar];
const clientSecret = process.env[target.secretVar];
if (!clientId || !clientSecret) {
  console.error(`Set ${target.idVar} and ${target.secretVar} env vars first.`);
  process.exit(1);
}

// CSRF protection: the callback must echo back this value.
const state = randomBytes(16).toString('hex');

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();

function openBrowser(url) {
  // execFile (no shell) so `&` in the query string isn't interpreted by cmd/sh.
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
  execFile(cmd, args, () => {
    /* ignore — user can paste manually */
  });
}

function finish(res, status, message, exitCode) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  // Exit only once the response is flushed so the browser sees it.
  res.end(message, () => {
    server.close();
    process.exit(exitCode);
  });
}

function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }).toString();
    const req = https.request(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let data = '';
        res.on('data', c => {
          data += c;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            reject(e);
            return;
          }
          if (res.statusCode !== 200 || parsed.error) {
            reject(
              new Error(`${parsed.error ?? res.statusCode}: ${parsed.error_description ?? data}`),
            );
            return;
          }
          resolve(parsed);
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith('/oauth2callback')) {
    res.writeHead(404);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    console.error(`Authorization failed: ${oauthError}`);
    finish(res, 400, `Authorization failed: ${oauthError}`, 1);
    return;
  }
  if (url.searchParams.get('state') !== state) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('State mismatch — ignoring this request.');
    return;
  }
  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing ?code');
    return;
  }
  try {
    const tok = await exchangeCode(code);
    if (!tok.refresh_token) {
      console.error(
        'No refresh token returned — revoke the app in https://myaccount.google.com/permissions and retry.',
      );
      finish(res, 500, 'No refresh token returned — see terminal.', 1);
      return;
    }
    console.info(`\n${target.tokenVar}=${tok.refresh_token}`);
    finish(res, 200, 'Done — you can close this tab.', 0);
  } catch (err) {
    console.error('Token exchange failed:', err instanceof Error ? err.message : err);
    finish(res, 500, 'Exchange failed — see terminal.', 1);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.info(`Listening on ${REDIRECT}`);
  console.info('Opening browser. If it does not open, paste this URL:\n' + authUrl + '\n');
  openBrowser(authUrl);
});
