export type Platform = 'meet' | 'zoom' | 'teams';

export function platformFromHostname(hostname: string): Platform | null {
  const h = hostname.toLowerCase();
  if (h === 'meet.google.com') return 'meet';
  if (h === 'zoom.us' || h.endsWith('.zoom.us')) return 'zoom';
  if (h === 'teams.microsoft.com' || h === 'teams.live.com') return 'teams';
  return null;
}

export function platformFromUrl(url: string | undefined): Platform | null {
  if (!url) return null;
  try {
    return platformFromHostname(new URL(url).hostname);
  } catch {
    return null;
  }
}
