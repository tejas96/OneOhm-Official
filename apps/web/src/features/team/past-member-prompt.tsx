'use client';

import { Button } from '@oneohm/design-system/web';
import { UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';
import type { PastMember } from './past-member';
import { calendarDate } from './workforce-format';

/**
 * The number being added still sits on a past member's record. The admin either brings
 * that person back or moves the number to the new person; never a bare "already exists".
 */
export function PastMemberPrompt({
  member,
  pending,
  onGiveNumber,
}: {
  readonly member: PastMember;
  readonly pending: boolean;
  readonly onGiveNumber: () => void;
}) {
  const t = useTranslations('team.addDialog.pastMember');
  const format = useFormatter();
  const name = member.fullName;
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 rounded-lg border border-hairline bg-sunken px-4 py-3.5"
    >
      <p className="flex items-start gap-2.5 type-body-sm text-ink">
        <UserRound aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        {member.leftOn
          ? t('left', {
              name,
              date: format.dateTime(calendarDate(member.leftOn.slice(0, 10)), {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }),
            })
          : t('leftNoDate', { name })}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {/* Bringing a past member back arrives with rejoining (Part C); shown, not yet usable. */}
        <Button size="sm" variant="secondary" disabled>
          {t('addBack', { name })}
        </Button>
        <Button size="sm" variant="primary" pending={pending} onClick={onGiveNumber}>
          {t('giveNumber')}
        </Button>
      </div>
    </motion.div>
  );
}
