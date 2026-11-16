'use client';

import { Button } from '@oneohm/design-system/web';
import { MapPinOff, RefreshCw, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type NoticeKind = 'nobodyOnDuty' | 'nobody' | 'error' | 'noMap';

/** What the map says over itself, if anything: a failed first load, nobody, nobody on duty. */
export function noticeFor(state: {
  readonly failed: boolean;
  readonly loaded: boolean;
  readonly picked: boolean;
  readonly people: number;
  readonly onDuty: number;
}): NoticeKind | null {
  if (state.failed && !state.loaded) return 'error';
  if (!state.loaded || state.picked) return null;
  if (state.people === 0) return 'nobody';
  return state.onDuty === 0 ? 'nobodyOnDuty' : null;
}

const ICONS = { nobodyOnDuty: UsersRound, nobody: UsersRound, error: RefreshCw, noMap: MapPinOff };

/** A calm card in the middle of the map: nobody on duty, nobody to show, or a failed load. */
export function MapNotice({
  kind,
  onRetry,
}: {
  readonly kind: NoticeKind;
  readonly onRetry?: (() => void) | undefined;
}) {
  const t = useTranslations(`liveMap.notice.${kind}`);
  const Icon = ICONS[kind];
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div
        role={kind === 'error' ? 'alert' : 'status'}
        className="live-glass pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl px-7 py-6 text-center"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon aria-hidden className="size-5" />
        </span>
        <p className="type-title-md text-ink">{t('title')}</p>
        <p className="type-body-sm text-ink-muted">{t('body')}</p>
        {onRetry && (
          <Button size="sm" onClick={onRetry} leadingIcon={<RefreshCw />}>
            {t('action')}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * While Google's map loads: the map's own ground colour with faint streets and a slow
 * shimmer, so the screen never flashes black. The panel and its list show meanwhile.
 */
export function MapLoading() {
  const t = useTranslations('liveMap');
  return (
    <div role="status" aria-label={t('loading')} className="live-map-skeleton absolute inset-0">
      <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_30%,color-mix(in_oklab,var(--oh-raised)_55%,transparent)_50%,transparent_70%)] bg-[length:200%_100%]" />
    </div>
  );
}
