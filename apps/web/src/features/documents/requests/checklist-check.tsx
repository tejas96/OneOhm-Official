'use client';

import type { ChecklistItem } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReaskTarget } from './reask-sheet';
import { useCheckPapers } from './use-document-requests';

/** A paper that arrived and waits for the team: [Looks good] and, if asked, [Ask again]. */
export function CheckButtons({
  item,
  onReask,
}: {
  readonly item: ChecklistItem;
  readonly onReask: (target: ReaskTarget) => void;
}) {
  const t = useTranslations('documents.checklist');
  const check = useCheckPapers();
  const actionId = item.actionId;
  return (
    <span className="-ml-2 mt-1 flex flex-wrap gap-1">
      <Button
        size="sm"
        variant="quiet"
        leadingIcon={<Check />}
        pending={check.isPending}
        onClick={() => check.mutate(item.documentIds)}
      >
        {t('looksGood')}
      </Button>
      {actionId && (
        <Button
          size="sm"
          variant="quiet"
          onClick={() => onReask({ id: actionId, title: item.label })}
        >
          {t('askAgain')}
        </Button>
      )}
    </span>
  );
}
