import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryProspectContext, storeCallMemory } from './octamem.js';

describe('octamem', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('queryProspectContext returns null when key is placeholder', async () => {
    const res = await queryProspectContext({ apiKey: 'your-octamem-key-here', prospect: { name: 'J' } });
    expect(res).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('queryProspectContext returns result string on success', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: async () => ({ result: 'Last spoke 2026-03-10' }),
    });
    const res = await queryProspectContext({ apiKey: 'real-key', prospect: { name: 'James', company: 'Acme' } });
    expect(res).toBe('Last spoke 2026-03-10');
  });

  it('queryProspectContext returns null on fetch failure', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('net'));
    const res = await queryProspectContext({ apiKey: 'real-key', prospect: { name: 'J' } });
    expect(res).toBeNull();
  });

  it('storeCallMemory returns null when key is placeholder', async () => {
    const res = await storeCallMemory({
      apiKey: 'your-octamem-key-here',
      contact: { name: 'J' }, callType: 'investor', durationMs: 0, sentimentAvg: 0,
      summary: { winSignals: [], objections: [], decisions: [], followUpDraft: '' },
      dangerMoments: [],
    });
    expect(res).toBeNull();
  });

  it('storeCallMemory posts formatted memory and returns id', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: async () => ({ id: 'mem_123' }),
    });
    const res = await storeCallMemory({
      apiKey: 'real-key',
      contact: { name: 'James', company: 'Acme', role: 'CEO' },
      callType: 'investor',
      durationMs: 1800000,
      sentimentAvg: 72,
      summary: { winSignals: ['Asked about timing'], objections: ['Burn rate'], decisions: ['Send deck'], followUpDraft: 'James, great...' },
      dangerMoments: [{ reason: 'pricing objection', timestamp: 1700000000000 }],
      previousOctamemId: 'mem_prev',
    });
    expect(res).toBe('mem_123');
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.content).toContain('James');
    expect(body.content).toContain('investor');
    expect(body.previousContext).toBe('mem_prev');
  });
});
