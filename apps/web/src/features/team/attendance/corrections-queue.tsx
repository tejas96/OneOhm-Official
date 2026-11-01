'use client';

import type { AttendanceCorrection } from '@oneohm/api-contracts';
import { Button, Card, CardHeader, listItemEnter, useToast } from '@oneohm/design-system/web';
import { Check, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DecideDialog, type DecisionTarget } from '../decide-dialog';
import { PersonChip } from '../person-chip';
import { useWorkforceFormat } from '../workforce-format';
import { useDecideCorrection } from './use-attendance';

/** Fixes people asked for to a check-in or check-out; approving changes their day. */
export function CorrectionsQueue({ items }: { readonly items: readonly AttendanceCorrection[] }) {
  const t = useTranslations('team.attendance.corrections');
  const toast = useToast();
  const format = useWorkforceFormat();
  const decide = useDecideCorrection();
  const [open, setOpen] = useState<{ item: AttendanceCorrection; target: DecisionTarget } | null>(
    null,
  );

  const start = (item: AttendanceCorrection, approve: boolean) =>
    setOpen({
      item,
      target: {
        approve,
        title: t('dialogTitle', { name: item.user.fullName, day: format.day(item.workDate) }),
        summary: <p className="type-body text-ink-muted">“{item.reason}”</p>,
      },
    });

  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={t('description')}
        action={<span className="type-body-sm text-ink-faint tabular-nums">{items.length}</span>}
      />
      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {items.map((item, index) => (
          <motion.li
            key={item.id}
            {...listItemEnter(index)}
            className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <PersonChip person={item.user} detail={format.longDay(item.workDate)} />
              <p className="type-body-sm text-ink">
                {[
                  item.checkInAt && t('checkIn', { time: format.time(item.checkInAt) }),
                  item.checkOutAt && t('checkOut', { time: format.time(item.checkOutAt) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="type-body-sm text-ink-muted">“{item.reason}”</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" leadingIcon={<X />} onClick={() => start(item, false)}>
                {t('decline')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                leadingIcon={<Check />}
                onClick={() => start(item, true)}
              >
                {t('approve')}
              </Button>
            </div>
          </motion.li>
        ))}
      </ul>
      <DecideDialog
        target={open?.target ?? null}
        onClose={() => setOpen(null)}
        onDecide={async (approve, note) => {
          if (!open) return;
          await decide(open.item.id, approve, note);
          toast({
            title: approve ? t('approved') : t('declined'),
            reference: open.item.user.fullName,
            tone: 'success',
          });
        }}
      />
    </Card>
  );
}
