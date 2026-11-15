'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type MarketingTab = 'campaigns' | 'connections';

export interface MarketingUrl {
  readonly tab: MarketingTab;
  readonly newCampaign: boolean;
  readonly campaignId: string | null;
  readonly connected: 'meta' | 'google' | null;
  readonly error: string | null;
  readonly setTab: (tab: MarketingTab) => void;
  readonly setNew: (open: boolean) => void;
  readonly setCampaign: (id: string | null) => void;
  /** Closes New campaign and opens the campaign it made, in one step. */
  readonly showMade: (id: string) => void;
  /** Drops the one-time `connected` and `error` words after they were shown. */
  readonly clearNotice: () => void;
}

/** The open tab, New campaign and campaign detail live in the address, so a link opens the same. */
export function useMarketingUrl(): MarketingUrl {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const change = (edit: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    edit(next);
    const suffix = next.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  };
  const connected = params.get('connected');
  return {
    tab: params.get('tab') === 'connections' ? 'connections' : 'campaigns',
    newCampaign: params.get('new') === '1',
    campaignId: params.get('campaign'),
    connected: connected === 'meta' || connected === 'google' ? connected : null,
    error: params.get('error'),
    setTab: (tab) =>
      change((next) => {
        if (tab === 'campaigns') next.delete('tab');
        else next.set('tab', tab);
      }),
    setNew: (open) =>
      change((next) => {
        if (open) next.set('new', '1');
        else next.delete('new');
      }),
    setCampaign: (id) =>
      change((next) => {
        if (id) next.set('campaign', id);
        else next.delete('campaign');
      }),
    showMade: (id) =>
      change((next) => {
        next.delete('new');
        next.set('campaign', id);
      }),
    clearNotice: () =>
      change((next) => {
        next.delete('connected');
        next.delete('error');
      }),
  };
}
