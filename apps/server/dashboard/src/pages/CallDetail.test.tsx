import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import CallDetail from './CallDetail';
import { json, mockFetch, renderAt } from '../test/utils';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const call = {
  id: 'call-1', contactId: null, platform: 'meet', callType: 'investor',
  startedAt: Date.UTC(2026, 0, 1), endedAt: null, durationMs: null, sentimentAvg: null,
};

describe('CallDetail page', () => {
  it('shows "Call not found" for an unknown id instead of an endless skeleton', async () => {
    mockFetch(() => json({ error: 'not found' }, 404));
    renderAt(<CallDetail />, { path: '/calls/:id', url: '/calls/missing' });
    expect((await screen.findByRole('alert')).textContent).toMatch('Call not found');
  });

  it('reports a failed copy when the clipboard API is unavailable', async () => {
    mockFetch(url => {
      if (url.endsWith('/summary')) {
        return json({
          winSignals: [], objections: [], decisions: [], followUpDraft: 'Hi there', createdAt: 1, scorecard: null,
        });
      }
      if (url.endsWith('/call-1')) return json(call);
      return json([]);
    });
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    renderAt(<CallDetail />, { path: '/calls/:id', url: '/calls/call-1' });

    fireEvent.click(await screen.findByRole('button', { name: /copy/i }));
    expect(await screen.findByText(/Copy failed/)).toBeTruthy();
  });
});
