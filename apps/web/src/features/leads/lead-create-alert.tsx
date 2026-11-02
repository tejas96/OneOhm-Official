'use client';

import { ArrowRight, CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** Why a new lead was not saved; a duplicate links to the lead that already has the phone. */
export function LeadCreateAlert({
  message,
  duplicateId,
}: {
  readonly message: string;
  readonly duplicateId: string | null;
}) {
  const t = useTranslations('leads.create');
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg bg-overdue-tint px-3.5 py-3 type-body-sm text-overdue sm:col-span-2"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        <p>{message}</p>
        {duplicateId && (
          <Link
            href={`/leads/${duplicateId}`}
            className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
          >
            {t('openExisting')}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
