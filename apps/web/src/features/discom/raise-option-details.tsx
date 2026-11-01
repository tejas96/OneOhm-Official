'use client';

import type { ChangeRequestOption } from '@oneohm/api-contracts';
import { CircleCheck, CircleDashed } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The papers the chosen change needs (ticked when on file), its steps and its impact. */
export function RaiseOptionDetails({
  option,
  error,
}: {
  readonly option: ChangeRequestOption;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('discom.raise');
  const docT = useTranslations('documents.categories');
  return (
    <div className="flex flex-col gap-2">
      {option.documents.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="type-label text-ink-muted">{t('papers')}</p>
          <ul className="flex flex-col gap-1">
            {option.documents.map((paper) => (
              <li key={paper.category} className="flex items-center gap-2 type-body-sm text-ink">
                {paper.onFile ? (
                  <CircleCheck aria-hidden className="size-4 text-on-track" />
                ) : (
                  <CircleDashed aria-hidden className="size-4 text-overdue" />
                )}
                {docT(paper.category)}
                <span className="text-ink-faint">
                  {paper.onFile ? t('onFile') : t('notOnFile')}
                </span>
              </li>
            ))}
          </ul>
          {error && <p className="type-body-sm text-overdue">{t('papersMissing')}</p>}
        </div>
      )}
      <p className="type-body-sm text-ink-muted">
        {t('steps', { count: option.steps })}
        {option.holdsProjectWork && ` ${t('blocks')}`}
      </p>
    </div>
  );
}
