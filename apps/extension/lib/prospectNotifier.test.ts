import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProspectNotifier } from './prospectNotifier';

describe('createProspectNotifier', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses a burst of DOM mutations into one scrape', () => {
    const scrape = vi.fn(() => ['Ada']);
    const send = vi.fn();
    const n = createProspectNotifier(scrape, send, 1000);
    for (let i = 0; i < 100; i++) n.schedule();
    vi.advanceTimersByTime(1000);
    expect(scrape).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(['Ada']);
  });

  it('only sends when the scraped names change', () => {
    let names = ['Ada'];
    const send = vi.fn();
    const n = createProspectNotifier(() => names, send, 1000);
    n.flush();
    n.flush();
    expect(send).toHaveBeenCalledOnce();
    names = ['Ada', 'Grace'];
    n.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('never sends empty name lists and stops after dispose', () => {
    const send = vi.fn();
    const n = createProspectNotifier(() => [], send, 1000);
    n.flush();
    n.schedule();
    n.dispose();
    vi.advanceTimersByTime(5000);
    expect(send).not.toHaveBeenCalled();
  });
});
