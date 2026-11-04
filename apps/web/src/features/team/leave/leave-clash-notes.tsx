'use client';

import type { LeaveClashes } from '@oneohm/api-contracts';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useWorkforceFormat } from '../workforce-format';

/** Warnings, not blocks: the backup is away, or the one asking is covering someone. */
export function LeaveClashNotes({
  clashes,
  applicant,
}: {
  readonly clashes: LeaveClashes;
  /** The person asking, when someone else is reading ("you" otherwise). */
  readonly applicant?: string | undefined;
}) {
  const t = useTranslations('team.leave.clash');
  const format = useWorkforceFormat();
  const notes = [
    ...clashes.backupAway.map((item) => ({
      key: `away-${item.user.id}-${item.fromDate}`,
      text: t('backupAway', {
        name: item.user.fullName,
        range: format.range(item.fromDate, item.toDate),
        status: t(item.status),
      }),
    })),
    ...clashes.covering.map((item) => {
      const range = format.range(item.fromDate, item.toDate);
      return {
        key: `cover-${item.user.id}-${item.fromDate}`,
        text: applicant
          ? t('coveringOther', { applicant, name: item.user.fullName, range })
          : t('coveringSelf', { name: item.user.fullName, range }),
      };
    }),
  ];
  if (notes.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {notes.map((note) => (
        <li
          key={note.key}
          className="flex items-start gap-2 rounded-md bg-at-risk-tint px-3 py-2.5 type-body-sm text-ink"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
          {note.text}
        </li>
      ))}
    </ul>
  );
}
