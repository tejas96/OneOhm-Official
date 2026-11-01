'use client';

import { Button, Field, Textarea } from '@oneohm/design-system/web';
import { PackageCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/providers/current-user';

/**
 * The handover waits until no material is left with a contractor (PRD 3.17). A manager
 * may hand over anyway with a reason; the reason goes in the project history and the
 * audit trail. Others see where to go instead.
 */
export function MaterialOverride({
  pending,
  error,
  onOverride,
}: {
  readonly pending: boolean;
  readonly error: string | undefined;
  readonly onOverride: (reason: string) => void;
}) {
  const t = useTranslations('projects.complete.material');
  const isManager = useCan('projects.manage');
  const [reason, setReason] = useState('');
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-sunken px-4 py-3.5">
      <p className="flex items-start gap-2 type-body-sm text-ink">
        <PackageCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        {isManager ? t('managerIntro') : t('staffIntro')}
      </p>
      {isManager && (
        <>
          <Field label={t('reason')} hint={t('reasonHint')} error={error}>
            <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Button
            type="button"
            variant="secondary"
            pending={pending}
            onClick={() => onOverride(reason.trim())}
            className="self-start"
          >
            {t('override')}
          </Button>
        </>
      )}
    </section>
  );
}
