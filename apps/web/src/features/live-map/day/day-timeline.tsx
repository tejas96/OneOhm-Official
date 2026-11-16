'use client';

import type { DutyDaySegment } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { Building2, Car, CircleQuestionMark, Home, MapPin, WifiOff } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type CSSProperties, memo } from 'react';
import { VisitProof } from '@/features/site-activity/visit-proof';

/** Each kind's colour on the rail, from the duty tokens. */
function toneOf(segment: DutyDaySegment): string {
  switch (segment.kind) {
    case 'travel':
      return 'var(--oh-duty-moving)';
    case 'visit':
      return 'var(--oh-duty-visit)';
    case 'gap':
      return 'var(--oh-duty-gap)';
    default:
      return segment.place === 'unknown' ? 'var(--oh-duty-idle)' : 'var(--oh-ink-muted)';
  }
}

function IconOf({ segment }: { readonly segment: DutyDaySegment }) {
  if (segment.kind === 'travel') return <Car aria-hidden />;
  if (segment.kind === 'visit') return <Home aria-hidden />;
  if (segment.kind === 'gap') return <WifiOff aria-hidden />;
  if (segment.place === 'office') return <Building2 aria-hidden />;
  if (segment.place === 'site') return <MapPin aria-hidden />;
  return <CircleQuestionMark aria-hidden />;
}

/**
 * The day as a vertical timeline, oldest at the top: stops, travel, visits and gaps, each
 * with its time and what it means. The replay's segment is marked; tapping one jumps there.
 */
export const DayTimeline = memo(function DayTimeline({
  segments,
  active,
  picked,
  onPick,
}: {
  readonly segments: readonly DutyDaySegment[];
  readonly active: number;
  readonly picked: number | null;
  readonly onPick: (index: number) => void;
}) {
  const t = useTranslations('liveMap.day');
  const words = useTranslations('liveMap.words');
  const format = useFormatter();
  const clock = (iso: string) =>
    format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' });
  const length = (minutes: number) =>
    minutes >= 60
      ? t('hoursMinutes', { h: Math.floor(minutes / 60), m: minutes % 60 })
      : t('minutes', { m: minutes });
  if (segments.length === 0)
    return <p className="px-5 py-6 type-body-sm text-ink-muted">{t('empty')}</p>;
  return (
    <ol className="relative flex flex-col px-3 pb-4">
      {segments.map((segment, index) => {
        const flagged = segment.kind === 'stop' && segment.flagged;
        const { title, note } = describe(segment);
        return (
          <li key={`${segment.kind}-${segment.startAt}`} className="relative">
            <button
              type="button"
              onClick={() => onPick(index)}
              aria-current={index === active ? 'step' : undefined}
              style={{ '--tone': toneOf(segment) } as CSSProperties}
              className={cn(
                'group grid w-full grid-cols-[4.25rem_1.75rem_1fr] items-start gap-x-2 rounded-xl px-2 py-2 text-left transition-colors duration-(--duration-fast) hover:bg-sunken',
                index === picked && 'bg-sunken',
                index === active && 'bg-[color-mix(in_oklab,var(--tone)_9%,transparent)]',
              )}
            >
              <span className="whitespace-nowrap pt-1 text-right font-mono text-[0.75rem] text-ink-faint tabular-nums">
                {clock(segment.startAt)}
              </span>
              <span className="relative flex h-full justify-center">
                <span
                  aria-hidden
                  className="absolute top-7 -bottom-4 w-0.5 rounded-full bg-hairline group-last:hidden"
                />
                <span
                  className={cn(
                    'relative z-1 flex size-7 items-center justify-center rounded-full text-raised [&_svg]:size-3.5',
                    segment.kind === 'travel'
                      ? 'bg-raised text-(--tone) ring-2 ring-(--tone)'
                      : 'bg-(--tone)',
                    index === active &&
                      'ring-4 ring-[color-mix(in_oklab,var(--tone)_30%,transparent)]',
                  )}
                >
                  <IconOf segment={segment} />
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 pb-1">
                <span
                  className={cn('type-body-sm font-medium text-ink', flagged && 'text-at-risk')}
                >
                  {title}
                </span>
                {note && <span className="type-label text-ink-muted">{note}</span>}
                {segment.kind === 'visit' && segment.proof && (
                  <span className="mt-1">
                    <VisitProof
                      proof={segment.proof}
                      reasons={segment.proofReasons}
                      customerSaid={segment.customerSaid ?? null}
                      showReasons
                    />
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  function describe(segment: DutyDaySegment): { title: string; note: string | null } {
    const span = length(segment.minutes);
    switch (segment.kind) {
      case 'travel':
        return { title: t('travel', { km: segment.km.toFixed(1) }), note: span };
      case 'visit':
        return {
          title: segment.label,
          note: segment.open
            ? t('visitOpen', { place: segment.siteLabel ?? '', span })
            : [segment.siteLabel, span].filter(Boolean).join(', '),
        };
      case 'gap':
        return {
          title: t('gap', { span }),
          note: t('likely', { reason: words(`gapReason.${segment.reason}`) }),
        };
      default:
        if (segment.place === 'unknown')
          return {
            title: t('unknownStop', { span }),
            note: segment.flagged ? t('unknownNote') : null,
          };
        return {
          title: segment.placeLabel ?? t(`stopAt.${segment.place}`),
          note: t('stopped', { span }),
        };
    }
  }
});
