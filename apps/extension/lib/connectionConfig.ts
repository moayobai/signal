export interface SignalConnectionConfig {
  serverUrl: string;
  authToken: string;
}

export const DEFAULT_SIGNAL_SERVER_URL = 'http://localhost:8080';
export const SIGNAL_SERVER_URL_KEY = 'signalServerUrl';
export const SIGNAL_AUTH_TOKEN_KEY = 'signalAuthToken';

export function normalizeServerUrl(
  input: string | undefined,
  fallback = DEFAULT_SIGNAL_SERVER_URL,
): string {
  const raw = input?.trim() || fallback;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw);
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : `${local ? 'http' : 'https'}://${raw}`;
  const url = new URL(withProtocol);

  if (url.protocol === 'ws:') url.protocol = 'http:';
  if (url.protocol === 'wss:') url.protocol = 'https:';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Server URL must use http, https, ws, or wss');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function wsUrlFromServerUrl(serverUrl: string, path = '/ws'): string {
  const url = new URL(normalizeServerUrl(serverUrl));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = path.startsWith('/') ? path : `/${path}`;
  return url.toString();
}

export function authHeaders(authToken: string): Record<string, string> {
  const token = authToken.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function authenticatedWsUrl(wsUrl: string, authToken: string): string {
  const token = authToken.trim();
  if (!token) return wsUrl;
  const url = new URL(wsUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function readSignalConnectionConfig(
  defaults: SignalConnectionConfig,
): Promise<SignalConnectionConfig> {
  const stored = (await chrome.storage.local.get([
    SIGNAL_SERVER_URL_KEY,
    SIGNAL_AUTH_TOKEN_KEY,
  ])) as Record<string, unknown>;
  return {
    serverUrl: normalizeServerUrl(
      typeof stored[SIGNAL_SERVER_URL_KEY] === 'string'
        ? stored[SIGNAL_SERVER_URL_KEY]
        : defaults.serverUrl,
      defaults.serverUrl,
    ),
    authToken:
      typeof stored[SIGNAL_AUTH_TOKEN_KEY] === 'string'
        ? stored[SIGNAL_AUTH_TOKEN_KEY]
        : defaults.authToken,
  };
}

export async function writeSignalConnectionConfig(
  config: SignalConnectionConfig,
): Promise<SignalConnectionConfig> {
  const normalized: SignalConnectionConfig = {
    serverUrl: normalizeServerUrl(config.serverUrl),
    authToken: config.authToken.trim(),
  };
  await chrome.storage.local.set({
    [SIGNAL_SERVER_URL_KEY]: normalized.serverUrl,
    [SIGNAL_AUTH_TOKEN_KEY]: normalized.authToken,
  });
  return normalized;
}
