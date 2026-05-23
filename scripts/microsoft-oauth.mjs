#!/usr/bin/env node
/**
 * One-off Microsoft OAuth helper for Outlook mail + calendar connectors.
 *
 * Usage:
 *   OUTLOOK_CLIENT_ID=... OUTLOOK_CLIENT_SECRET=... node scripts/microsoft-oauth.mjs
 *
 * Opens the Microsoft consent page, captures the ?code= redirect on a local
 * loopback server, exchanges it for a refresh token, and prints the refresh
 * token so you can paste it into OUTLOOK_REFRESH_TOKEN.
 *
 * In Azure Portal -> App registrations -> Authentication, add this redirect URI:
 *   http://127.0.0.1:8422/oauth2callback
 */
import http from 'node:http';
import https from 'node:https';
import { exec } from 'node:child_process';

const PORT = 8422;
const REDIRECT = `http://127.0.0.1:${PORT}/oauth2callback`;
const SCOPE =
  'offline_access https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/Mail.Read';

const clientId = process.env.OUTLOOK_CLIENT_ID;
const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
const tenantId = process.env.OUTLOOK_TENANT_ID || 'common';

if (!clientId || !clientSecret) {
  console.error('Set OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET env vars first.');
  process.exit(1);
}

const authUrl =
  `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize?` +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    response_mode: 'query',
    scope: SCOPE,
    prompt: 'consent',
  }).toString();

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {
    /* ignore — user can paste manually */
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
      scope: SCOPE,
    }).toString();
    const req = https.request(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
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
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
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
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(`Microsoft returned error: ${error}`);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing ?code');
    return;
  }
  try {
    const tok = await exchangeCode(code);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Done — you can close this tab.</h2>');
    console.log('\nAccess token:', tok.access_token ? '(ok)' : '(missing)');
    console.log('Refresh token:', tok.refresh_token ?? '(none — retry with prompt=consent)');
    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500);
    res.end('Exchange failed: ' + String(err));
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Listening on ${REDIRECT}`);
  console.log('Opening browser. If it does not open, paste this URL:\n' + authUrl + '\n');
  openBrowser(authUrl);
});
