'use client';

import type { ChecklistItem } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  CardHeader,
  type PillTone,
  StatusPill,
  useToast,
} from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Printer, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { AskCustomerSheet, type AskDraft } from './requests/ask-customer-sheet';
import { CustomerRequestsCard } from './requests/customer-requests-card';
import { checklistKey } from './requests/use-document-requests';
import { useDocumentRights } from './use-document-rights';

const TONE: Readonly<Record<ChecklistItem['status'], PillTone>> = {
  present: 'done',
  missing: 'atRisk',
  ready_to_save: 'review',
  not_ready: 'neutral',
};

/**
 * The papers and reports this project needs, which are on file and which are not
 * (PRD 3.14), with the papers asked from the customer (PRD 5.4) just below.
 */
export function DocumentChecklistCard({ projectId }: { readonly projectId: string }) {
  const canAsk = useDocumentRights().upload;
  const [draft, setDraft] = useState<AskDraft | null>(null);
  return (
    <>
      <ChecklistCard projectId={projectId} onAsk={canAsk ? setDraft : null} />
      <CustomerRequestsCard
        projectId={projectId}
        canAsk={canAsk}
        onAsk={() => setDraft({ category: 'other', title: '' })}
      />
      <AskCustomerSheet projectId={projectId} draft={draft} onClose={() => setDraft(null)} />
    </>
  );
}

/** A printable checklist, and one tap to save every ready report. */
function ChecklistCard({
  projectId,
  onAsk,
}: {
  readonly projectId: string;
  /** Opens the ask sheet for a missing customer paper; null without the right. */
  readonly onAsk: ((draft: AskDraft) => void) | null;
}) {
  const t = useTranslations('documents.checklist');
  const toast = useToast();
  const client = useQueryClient();
  const canSave = useCan('reports.generate');
  const key = checklistKey(projectId);
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      expectStatus(api.documentChecklist.checklist({ params: { id: projectId } }), 200),
  });
  const save = useMutation({
    mutationFn: () =>
      expectStatus(api.reports.archiveProjectReports({ params: { id: projectId }, body: {} }), 200),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({ queryKey: ['documents'] });
      toast({
        tone: 'success',
        title: t('saved', { saved: result.saved, unchanged: result.unchanged }),
      });
    },
    onError: (error) => toast({ tone: 'error', title: describeError(error) }),
  });
  const ready = query.data?.items.some((item) => item.status === 'ready_to_save') ?? false;
  const share = query.data && query.data.total > 0 ? query.data.present / query.data.total : 0;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={t('title')}
        action={
          <span className="flex flex-wrap gap-2">
            {canSave && (
              <Button
                size="sm"
                variant={ready ? 'primary' : 'secondary'}
                leadingIcon={<FileDown />}
                pending={save.isPending}
                onClick={() => save.mutate()}
              >
                {t('saveReports')}
              </Button>
            )}
            <Button asChild size="sm" variant="secondary" leadingIcon={<Printer />}>
              <a
                href={`/api/v1/projects/${projectId}/document-checklist/pdf`}
                target="_blank"
                rel="noopener"
              >
                {t('print')}
              </a>
            </Button>
          </span>
        }
      />
      <div className="flex flex-col gap-4 px-5 pb-5">
        {query.isPending && <ListSkeleton label={t('loading')} rows={5} />}
        {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
        {query.data && (
          <>
            <div className="flex flex-col gap-2">
              <p className="type-body-sm text-ink-muted">
                {t('summary', { present: query.data.present, total: query.data.total })}
              </p>
              <span className="block h-1.5 overflow-hidden rounded-full bg-sunken">
                <span
                  className="block h-full rounded-full bg-on-track-solid"
                  style={{ width: `${share * 100}%` }}
                />
              </span>
            </div>
            <ul className="grid grid-cols-1 divide-y divide-hairline md:grid-cols-2 md:gap-x-8 md:divide-y-0">
              {query.data.items.map((item) => (
                <li
                  key={item.key}
                  className="flex items-start justify-between gap-3 py-2.5 md:border-b md:border-hairline"
                >
                  <span className="flex min-w-0 flex-col items-start">
                    <span className="type-body-sm font-medium text-ink">{item.label}</span>
                    <span className="type-body-sm text-ink-faint">
                      {item.missing.length > 0
                        ? t('needs', { what: item.missing.join(', ') })
                        : item.why}
                    </span>
                    {onAsk && item.askCategory && !item.requested && (
                      <AskButton item={item} onAsk={onAsk} label={t('ask')} />
                    )}
                  </span>
                  <StatusPill
                    size="sm"
                    tone={item.requested ? 'waiting' : TONE[item.status]}
                    label={item.requested ? t('asked') : t(`status.${item.status}`)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function AskButton({
  item,
  onAsk,
  label,
}: {
  readonly item: ChecklistItem;
  readonly onAsk: (draft: AskDraft) => void;
  readonly label: string;
}) {
  const category = item.askCategory;
  if (!category) return null;
  return (
    <Button
      size="sm"
      variant="quiet"
      leadingIcon={<Send />}
      className="-ml-2 mt-1"
      onClick={() => onAsk({ category, title: item.label })}
    >
      {label}
    </Button>
  );
}
