'use client';

import type { MessageTemplate } from '@oneohm/api-contracts';
import { Badge, ResponsiveTable, StatusPill, type TableColumn } from '@oneohm/design-system/web';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { MessageTemplateDialog } from './message-template-dialog';
import { useMessageTemplates } from './use-templates';

/** The WhatsApp templates, matched one by one to what Meta approved (PRD 7.2). */
export function MessageTemplatesPanel() {
  const t = useTranslations('settings.messageTemplates');
  const query = useMessageTemplates();
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const name = (key: string) => (t.has(`names.${key}`) ? t(`names.${key}`) : key);

  const columns: readonly TableColumn<MessageTemplate>[] = [
    {
      key: 'message',
      header: t('columns.message'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={() => setEditing(row)}
            className="oh-stretched-link text-left type-body font-medium text-ink hover:text-accent"
          >
            {name(row.key)}
          </button>
          <span className="type-body-sm text-ink-faint">{t(`audience.${row.audience}`)}</span>
        </span>
      ),
    },
    {
      key: 'template',
      header: t('columns.template'),
      cell: (row) => (
        <span className="font-mono text-[0.8125rem] text-ink-muted">{row.metaName}</span>
      ),
    },
    {
      key: 'language',
      header: t('columns.language'),
      cell: (row) => <Badge variant="outline">{row.language}</Badge>,
    },
    {
      key: 'used',
      header: t('columns.used'),
      align: 'end',
      cell: (row) => (
        <span className="tabular-nums">{t('usedBy', { count: row.usedByTasks })}</span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => (
        <StatusPill
          size="sm"
          tone={row.active ? 'onTrack' : 'neutral'}
          label={row.active ? t('on') : t('off')}
        />
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="type-display-md text-ink">{t('title')}</h2>
          <p className="type-body text-ink-muted">{t('intro')}</p>
        </div>
        <Link
          href="/service?tab=log"
          className="inline-flex items-center gap-1 type-body-sm text-accent hover:underline"
        >
          {t('log')}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      {query.isPending && <ListSkeleton label={t('loading')} rows={6} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && (
        <ResponsiveTable
          caption={t('title')}
          columns={columns}
          rows={query.data}
          rowKey={(row) => row.key}
        />
      )}
      <MessageTemplateDialog
        template={editing}
        name={editing ? name(editing.key) : ''}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}
