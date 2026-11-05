'use client';

import type { PointsEntry } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cn,
  listItemEnter,
  useToast,
} from '@oneohm/design-system/web';
import { Check, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { FOCUSED_ROW, focusRowProps } from '@/lib/use-focus-row';
import { useCan, useCurrentUser } from '@/providers/current-user';
import { PersonChip } from '../person-chip';
import { useWorkforceFormat } from '../workforce-format';
import { useDecidePoints } from './use-points';

/** Points suggested by the system (ratings, on-time work) that wait for a person to agree. */
export function PointsSuggestions({
  entries,
  focused = null,
}: {
  readonly entries: readonly PointsEntry[];
  /** The suggestion a link pointed at, highlighted. */
  readonly focused?: string | null;
}) {
  const t = useTranslations('team.points.suggestions');
  const sourceT = useTranslations('team.points.source');
  const me = useCurrentUser();
  const canDecide = useCan('people.manage');
  const toast = useToast();
  const format = useWorkforceFormat();
  const decide = useDecidePoints();
  const [busy, setBusy] = useState<string | null>(null);
  const pending = entries.filter((entry) => entry.status === 'pending');

  const answer = async (entry: PointsEntry, approve: boolean) => {
    setBusy(`${entry.id}:${approve}`);
    try {
      await decide(entry.id, approve);
      toast({
        title: approve ? t('approved') : t('declined'),
        reference: entry.user.fullName,
        tone: 'success',
      });
    } catch (error) {
      toast({ title: t('failed'), description: describeError(error), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={pending.length > 0 ? t('description') : t('none')}
        action={
          pending.length > 0 && (
            <span className="type-body-sm text-ink-faint tabular-nums">{pending.length}</span>
          )
        }
      />
      {pending.length > 0 && (
        <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {pending.map((entry, index) => (
            <motion.li
              key={entry.id}
              {...listItemEnter(index)}
              {...focusRowProps(entry.id, focused)}
              className={cn('flex flex-col gap-2.5 px-5 py-4', entry.id === focused && FOCUSED_ROW)}
            >
              <div className="flex items-start justify-between gap-3">
                <PersonChip person={entry.user} detail={format.ago(entry.createdAt)} />
                <span className="shrink-0 font-mono text-[0.9375rem] text-ink tabular-nums">
                  +{entry.points}
                </span>
              </div>
              <p className="type-body-sm text-ink-muted">{entry.reason}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="soft">{sourceT(entry.sourceType)}</Badge>
                {canDecide && entry.user.id !== me.id && (
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      leadingIcon={<X />}
                      pending={busy === `${entry.id}:false`}
                      disabled={busy !== null}
                      onClick={() => answer(entry, false)}
                    >
                      {t('decline')}
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      leadingIcon={<Check />}
                      pending={busy === `${entry.id}:true`}
                      disabled={busy !== null}
                      onClick={() => answer(entry, true)}
                    >
                      {t('approve')}
                    </Button>
                  </span>
                )}
                {canDecide && entry.user.id === me.id && (
                  <span className="type-body-sm text-ink-faint">{t('yours')}</span>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </Card>
  );
}
