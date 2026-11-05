'use client';

import type { LeaveRequestRecord } from '@oneohm/api-contracts';
import { Button, Card, CardHeader, listItemEnter, useToast } from '@oneohm/design-system/web';
import { Check, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import { PersonChip } from '../person-chip';
import { useWorkforceFormat } from '../workforce-format';
import { LeaveApproveDialog } from './leave-approve-dialog';
import { LeaveClashNotes } from './leave-clash-notes';
import { LeaveCover, LeaveKind, useLeaveText } from './leave-facts';
import { useDecideLeave } from './use-leave';

/** Requests waiting for a decision, oldest first; approving hands the work to the backup. */
export function LeaveQueue({ requests }: { readonly requests: readonly LeaveRequestRecord[] }) {
  const t = useTranslations('team.leave.queue');
  const me = useCurrentUser();
  const toast = useToast();
  const format = useWorkforceFormat();
  const { when } = useLeaveText();
  const decide = useDecideLeave();
  const [open, setOpen] = useState<{ item: LeaveRequestRecord; approve: boolean } | null>(null);
  const pending = [...requests]
    // Nobody decides their own leave: those wait for someone else and show under "Your leave".
    .filter((item) => item.status === 'pending' && item.user.id !== me.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const start = (item: LeaveRequestRecord, approve: boolean) => setOpen({ item, approve });

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
          {pending.map((item, index) => (
            <motion.li
              key={item.id}
              {...listItemEnter(index)}
              className="flex flex-col gap-3 px-5 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <PersonChip
                  person={item.user}
                  detail={t('asked', { when: format.ago(item.createdAt) })}
                />
                <LeaveKind leave={item} />
              </div>
              <p className="type-title-md text-ink">{when(item)}</p>
              {item.reason && <p className="type-body-sm text-ink-muted">“{item.reason}”</p>}
              <LeaveCover leave={item} />
              <LeaveClashNotes clashes={item.clashes} applicant={item.user.fullName} />
              {item.backup?.id === me.id ? (
                // The named backup does not decide the leave they cover.
                <p className="type-body-sm text-ink-muted">{t('youCover')}</p>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
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
              )}
            </motion.li>
          ))}
        </ul>
      )}
      <LeaveApproveDialog
        leave={open?.item ?? null}
        leaning={open?.approve ?? true}
        onClose={() => setOpen(null)}
        onDecide={async (body) => {
          if (!open) return;
          const decided = await decide(open.item.id, body);
          const approve = body.approve;
          toast({
            title: approve ? t('approved') : t('declined'),
            description:
              approve && decided.backup
                ? t('approvedHandover', {
                    count: decided.tasksHandedOver,
                    name: decided.backup.fullName,
                  })
                : undefined,
            reference: decided.user.fullName,
            tone: 'success',
          });
        }}
      />
    </Card>
  );
}
