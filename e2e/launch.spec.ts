import { expect, test } from '@playwright/test';

const AUTH_TOKEN = 'signal-browser-e2e-token';

test('auth protects the API and dashboard token login is scrubbed into a cookie', async ({
  page,
  request,
}) => {
  const unauthenticated = await request.get('/api/contacts');
  expect(unauthenticated.status()).toBe(401);

  const bearer = await request.get('/api/contacts', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });
  expect(bearer.status()).toBe(200);

  const dashboard = await page.goto(`/dashboard/?token=${encodeURIComponent(AUTH_TOKEN)}`);
  expect(dashboard?.status()).toBe(200);
  await expect(page.getByText('Total calls')).toBeVisible();
  expect(page.url()).not.toContain('token=');

  const cookieBackedStatus = await page.evaluate(async () => {
    const res = await fetch('/api/contacts');
    return res.status;
  });
  expect(cookieBackedStatus).toBe(200);
});

test('browser websocket start and stop persists a complete call shell', async ({ page }) => {
  await page.goto(`/dashboard/?token=${encodeURIComponent(AUTH_TOKEN)}`);

  const sessionId = await page.evaluate(async token => {
    const wsUrl = new URL('/ws', window.location.href);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl.searchParams.set('token', token);

    const ws = new WebSocket(wsUrl);
    const connected = await new Promise<{ sessionId: string }>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error('Timed out waiting for connected')),
        5000,
      );
      ws.addEventListener('message', event => {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'connected') {
          window.clearTimeout(timer);
          resolve({ sessionId: msg.sessionId });
        }
      });
      ws.addEventListener('error', () => reject(new Error('WebSocket failed')));
    });

    ws.send(
      JSON.stringify({
        type: 'start',
        platform: 'meet',
        callType: 'enterprise',
        prospect: { name: 'Launch Buyer', company: 'Acme' },
      }),
    );

    await new Promise(resolve => window.setTimeout(resolve, 400));
    ws.send(JSON.stringify({ type: 'stop' }));
    await new Promise(resolve => window.setTimeout(resolve, 400));
    ws.close();
    return connected.sessionId;
  }, AUTH_TOKEN);

  const call = await page.evaluate(async id => {
    const res = await fetch(`/api/calls/${id}`);
    if (!res.ok) throw new Error(`Call lookup failed: ${res.status}`);
    return (await res.json()) as {
      contactId: string | null;
      endedAt: number | null;
      durationMs: number | null;
    };
  }, sessionId);

  expect(call.contactId).toBeTruthy();
  expect(call.endedAt).toEqual(expect.any(Number));
  expect(call.durationMs).toEqual(expect.any(Number));

  const contacts = await page.evaluate(async () => {
    const res = await fetch('/api/contacts');
    return (await res.json()) as Array<{ name: string; company?: string }>;
  });
  expect(
    contacts.some(contact => contact.name === 'Launch Buyer' && contact.company === 'Acme'),
  ).toBe(true);
});
