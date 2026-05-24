import { describe, expect, it } from 'vitest';
import {
  authHeaders,
  authenticatedWsProtocols,
  normalizeServerUrl,
  serverOriginPattern,
  wsUrlFromServerUrl,
} from './connectionConfig';

describe('connection config helpers', () => {
  it('normalizes server URLs to HTTP origins', () => {
    expect(normalizeServerUrl('localhost:8080')).toBe('http://localhost:8080');
    expect(normalizeServerUrl('ws://localhost:8080/ws')).toBe('http://localhost:8080/ws');
    expect(normalizeServerUrl('wss://signal.example.com/')).toBe('https://signal.example.com');
  });

  it('builds websocket URLs from normalized server URLs', () => {
    expect(wsUrlFromServerUrl('http://localhost:8080')).toBe('ws://localhost:8080/ws');
    expect(wsUrlFromServerUrl('https://signal.example.com')).toBe('wss://signal.example.com/ws');
  });

  it('adds auth to headers only when present', () => {
    expect(authHeaders(' token ')).toEqual({ Authorization: 'Bearer token' });
    expect(authHeaders('')).toEqual({});
  });

  it('builds websocket auth subprotocols without putting tokens in URLs', () => {
    expect(authenticatedWsProtocols(' secret/token+value ')).toEqual([
      'signal-token.c2VjcmV0L3Rva2VuK3ZhbHVl',
    ]);
    expect(authenticatedWsProtocols('')).toEqual([]);
  });

  it('builds extension host permission origins from server URLs', () => {
    expect(serverOriginPattern('https://signal.example.com/dashboard')).toBe(
      'https://signal.example.com/*',
    );
    expect(serverOriginPattern('localhost:8080')).toBe('http://localhost:8080/*');
  });
});
