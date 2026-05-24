#!/usr/bin/env node
/**
 * One-off Google OAuth helper for the Gmail connector.
 *
 * Usage:
 *   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node scripts/google-oauth.mjs
 *
 * Opens the consent page in your browser, captures the ?code= redirect on a
 * local loopback server, exchanges it for a refresh token, and prints the
 * refresh token so you can paste it into GMAIL_REFRESH_TOKEN.
 *
 * In Google Cloud Console → OAuth 2.0 Client IDs, add this redirect URI:
 *   http://127.0.0.1:8421/oauth2callback
 */
import http from 'node:http';
import https from 'node:https';
import { exec } from 'node:child_process';

const PORT = 8421;
const REDIRECT = `http://127.0.0.1:${PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars first.');
  process.exit(1);
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
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
    console.log(
      'Refresh token:',
      tok.refresh_token ??
        '(none — revoke the app in https://myaccount.google.com/permissions and retry)',
    );
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
