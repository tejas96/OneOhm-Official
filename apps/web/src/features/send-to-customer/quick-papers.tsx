'use client';

import { Button, useToast } from '@oneohm/design-system/web';
import { askKeyOf, type CustomerRequestableCategory } from '@oneohm/domain';
import { FilePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type ActionScope,
  type AskItem,
  useAskCustomer,
} from '@/features/documents/requests/use-document-requests';
import { describeError } from '@/lib/api/api-error';

/** A paper to ask for in one tap: the lender's list on a loan, the passbook on a subsidy step. */
export interface QuickPaper {
  readonly category: CustomerRequestableCategory;
  readonly title: string;
  readonly requirementKey?: string;
}

const itemOf = ({ category, title, requirementKey }: QuickPaper): AskItem => ({
  category,
  title,
  requirementKey: requirementKey ?? askKeyOf({ category, title }),
});

/**
 * Papers the customer can be asked for with one tap each (or all at once): every one becomes a paper
 * action with its own status, reminders and check (redesign §18 1, 11, 15).
 */
export function QuickPapers({
  scope,
  papers,
  onDone,
}: {
  readonly scope: ActionScope;
  readonly papers: readonly QuickPaper[];
  readonly onDone: () => void;
}) {
  const t = useTranslations('sendToCustomer.quickPapers');
  const toast = useToast();
  const ask = useAskCustomer(scope, onDone);
  const send = (items: readonly QuickPaper[]) =>
    ask.mutate(
      { items: items.map(itemOf), note: '' },
      {
        onError: (error) =>
          toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
      },
    );
  if (papers.length === 0) return null;
  return (
    <section className="flex flex-col gap-1 border-b border-hairline pb-4">
      <h3 className="pt-1 type-label text-ink-faint uppercase">{t('title')}</h3>
      <ul className="flex flex-col divide-y divide-hairline">
        {papers.map((paper) => (
          <li key={paper.title} className="flex items-center justify-between gap-3 py-2">
            <span className="type-body-sm text-ink">{paper.title}</span>
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<FilePlus />}
              disabled={ask.isPending}
              onClick={() => send([paper])}
            >
              {t('ask')}
            </Button>
          </li>
        ))}
      </ul>
      {papers.length > 1 && (
        <Button
          size="sm"
          variant="primary"
          className="mt-2 self-start"
          pending={ask.isPending}
          onClick={() => send(papers)}
        >
          {t('all', { count: papers.length })}
        </Button>
      )}
    </section>
  );
}
