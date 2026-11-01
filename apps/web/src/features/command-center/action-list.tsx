'use client';

import type { ActionItem } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  CardHeader,
  cn,
  listItemEnter,
  type PillTone,
  StatusGlyph,
  type StatusGlyphName,
} from '@oneohm/design-system/web';
import { CircleCheck } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const TONE_DISC: Readonly<Record<PillTone, string>> = {
  onTrack: 'bg-on-track-tint text-on-track',
  atRisk: 'bg-at-risk-tint text-at-risk',
  blocked: 'bg-blocked-tint text-blocked',
  overdue: 'bg-overdue-tint text-overdue',
  review: 'bg-review-tint text-review',
  waiting: 'bg-waiting-tint text-waiting',
  done: 'bg-done-tint text-done',
  neutral: 'bg-sunken text-ink-muted',
};

const TONE_GLYPH: Readonly<Record<PillTone, StatusGlyphName>> = {
  onTrack: 'onTrack',
  atRisk: 'atRisk',
  blocked: 'blocked',
  overdue: 'overdue',
  review: 'review',
  waiting: 'waiting',
  done: 'done',
  neutral: 'ready',
};

const PARTY_DOT = {
  internal: 'bg-party-internal',
  customer: 'bg-party-customer',
  bank: 'bg-party-bank',
  discom: 'bg-party-discom',
} as const;

/** What the owner can act on now, each with its one next action. */
export function ActionList({
  actions,
  compact = false,
  limit,
  className,
}: {
  readonly actions: readonly ActionItem[];
  readonly compact?: boolean;
  readonly limit?: number;
  readonly className?: string;
}) {
  const t = useTranslations('commandCenter.actions');
  const partyT = useTranslations('commandCenter.party');
  const [expanded, setExpanded] = useState(false);
  const items = limit && !expanded ? actions.slice(0, limit) : actions;
  const hidden = actions.length - items.length;
  return (
    <Card id="actions" className={cn('flex scroll-mt-24 flex-col overflow-hidden', className)}>
      <CardHeader
        title={t('title')}
        description={compact ? undefined : t('description')}
        action={
          <span className="rounded-full bg-ink px-2.5 py-0.5 font-mono text-[0.75rem] text-canvas">
            {actions.length}
          </span>
        }
      />
      {actions.length === 0 ? (
        <p className="flex items-center gap-2 border-t border-hairline px-5 py-6 type-body-sm text-ink-muted">
          <CircleCheck aria-hidden className="size-4 text-on-track" />
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {items.map((item, index) => (
            <motion.li
              key={item.id}
              {...listItemEnter(index)}
              className={cn(
                'group flex items-center gap-4 transition-colors duration-(--duration-fast) hover:bg-surface',
                compact ? 'px-5 py-3' : 'px-5 py-4',
              )}
            >
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full',
                  TONE_DISC[item.tone],
                )}
              >
                <StatusGlyph name={TONE_GLYPH[item.tone]} className="size-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p
                  className={cn('text-ink', compact ? 'type-body-sm font-medium' : 'type-title-md')}
                >
                  {item.title}
                </p>
                <p className="truncate type-body-sm text-ink-faint">{item.detail}</p>
              </div>
              {!compact && (
                <span className="hidden shrink-0 items-center gap-1.5 type-label text-ink-muted lg:inline-flex">
                  <span aria-hidden className={cn('size-2 rounded-full', PARTY_DOT[item.party])} />
                  {partyT(item.party)}
                </span>
              )}
              <Button
                asChild
                size="sm"
                variant={index === 0 && !compact ? 'primary' : 'secondary'}
                className="shrink-0"
              >
                <Link href={item.href}>{item.action}</Link>
              </Button>
            </motion.li>
          ))}
        </ul>
      )}
      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="border-t border-hairline px-5 py-3 text-left type-body-sm font-medium text-accent hover:bg-surface"
        >
          {expanded ? t('showFewer') : t('showAll', { count: actions.length })}
        </button>
      )}
    </Card>
  );
}
