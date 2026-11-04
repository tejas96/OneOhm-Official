'use client';

import { Button } from '@oneohm/design-system/web';
import { UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useLeftDate } from './left-tag';
import type { PastMember } from './past-member';

/** Which of the two choices is being saved, if any. */
export type PastMemberChoice = 'addBack' | 'giveNumber';

/**
 * The number being added still sits on a past member's record. The admin either brings
 * that person back or moves the number to the new person; never a bare "already exists".
 */
export function PastMemberPrompt({
  member,
  pending,
  onAddBack,
  onGiveNumber,
}: {
  readonly member: PastMember;
  readonly pending: PastMemberChoice | null;
  readonly onAddBack: () => void;
  readonly onGiveNumber: () => void;
}) {
  const t = useTranslations('team.addDialog.pastMember');
  const leftDate = useLeftDate();
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
          ? t('left', { name, date: leftDate(member.leftOn) })
          : t('leftNoDate', { name })}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          size="sm"
          variant="secondary"
          pending={pending === 'addBack'}
          disabled={pending === 'giveNumber'}
          onClick={onAddBack}
        >
          {t('addBack', { name })}
        </Button>
        <Button
          size="sm"
          variant="primary"
          pending={pending === 'giveNumber'}
          disabled={pending === 'addBack'}
          onClick={onGiveNumber}
        >
          {t('giveNumber')}
        </Button>
      </div>
    </motion.div>
  );
}
