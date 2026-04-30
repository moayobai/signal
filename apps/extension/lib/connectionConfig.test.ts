import { describe, expect, it } from 'vitest';
import {
  authHeaders,
  authenticatedWsUrl,
  normalizeServerUrl,
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

  it('adds auth to headers and websocket URLs only when present', () => {
    expect(authHeaders(' token ')).toEqual({ Authorization: 'Bearer token' });
    expect(authHeaders('')).toEqual({});
    expect(authenticatedWsUrl('wss://signal.example.com/ws', 'secret')).toBe(
      'wss://signal.example.com/ws?token=secret',
    );
    expect(authenticatedWsUrl('wss://signal.example.com/ws', '')).toBe(
      'wss://signal.example.com/ws',
    );
  });
});
