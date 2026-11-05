'use client';

import type { DocumentRequest } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { inPersonClose } from '@oneohm/domain';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDoneInPerson } from './use-document-requests';

/** What the team can do with an ask done in person: close it, answer it, or the step it needs first. */
export function InPersonDone({ request }: { readonly request: DocumentRequest }) {
  const t = useTranslations('documents.requests.doneInPerson');
  const done = useDoneInPerson();
  const how = inPersonClose(request.type, request.kind);
  if (how.how === 'hint') return <span className="type-body-sm text-ink-muted">{how.hint}</span>;
  if (how.how === 'confirm')
    return (
      <>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Check />}
          pending={done.isPending}
          onClick={() => done.mutate({ request, answer: 'yes' })}
        >
          {t('yes')}
        </Button>
        {/* "Not yet" pauses the roof question only; an installation is Yes, or a problem to report. */}
        {how.kind === 'site_ready' ? (
          <Button
            size="sm"
            variant="quiet"
            pending={done.isPending}
            onClick={() => done.mutate({ request, answer: 'not_yet' })}
          >
            {t('notYet')}
          </Button>
        ) : null}
      </>
    );
  return (
    <Button
      size="sm"
      variant="secondary"
      leadingIcon={<Check />}
      pending={done.isPending}
      onClick={() => done.mutate({ request })}
    >
      {t('action')}
    </Button>
  );
}
