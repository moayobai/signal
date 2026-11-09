/**
 * Debounces DOM-mutation-driven name scrapes and only reports when the set of
 * names actually changes — meeting UIs mutate many times per second.
 */
export function createProspectNotifier(
  scrape: () => string[],
  send: (names: string[]) => void,
  debounceMs = 1000,
): { schedule(): void; flush(): void; dispose(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastKey = '';

  function flush(): void {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    const names = scrape();
    if (names.length === 0) return;
    const key = names.join('\u0000');
    if (key === lastKey) return;
    lastKey = key;
    send(names);
  }

  return {
    schedule() {
      if (timer !== null) return;
      timer = setTimeout(flush, debounceMs);
    },
    flush,
    dispose() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
    },
  };
}
