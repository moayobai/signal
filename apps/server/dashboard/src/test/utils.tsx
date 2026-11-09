import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { shouldRetry } from '../lib/api';

export interface FetchCall { url: string; init?: RequestInit }

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Installs a fetch mock and returns the list of calls it receives. */
export function mockFetch(handler: Handler): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }));
  return calls;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Renders `element` at `path` inside a router + fresh QueryClient. */
export function renderAt(element: ReactElement, { path, url }: { path: string; url: string }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry, retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** jsdom has no <dialog> modal support. */
export function stubDialog(): void {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
