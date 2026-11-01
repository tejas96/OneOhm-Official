'use client';

import type { ProjectVariantRecord } from '@oneohm/api-contracts';
import { Button, ResponsiveTable, StatusPill, type TableColumn } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { ProjectTypeDialog } from './project-type-dialog';
import { RULE_KEYS } from './use-rule-settings';

/**
 * The kinds of project OneOhm builds (PRD 7.2 "project types"), each named and
 * described by the owner and switched off when not offered. A new kind needs its own
 * task rules, so the list is fixed; the task templates already know every kind here.
 */
export function ProjectTypesPanel() {
  const t = useTranslations('settings.rules.projectTypes');
  const [editing, setEditing] = useState<ProjectVariantRecord | null>(null);
  const query = useQuery({
    queryKey: RULE_KEYS.projectTypes,
    queryFn: () => expectStatus(api.businessSettings.projectVariants(), 200),
  });
  const columns: readonly TableColumn<ProjectVariantRecord>[] = [
    {
      key: 'name',
      header: t('columns.name'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setEditing(row)}
            className="oh-stretched-link text-left type-body font-medium text-ink hover:text-accent"
          >
            {row.name}
          </button>
          <span className="type-body-sm text-ink-muted">{row.description}</span>
        </span>
      ),
    },
    {
      key: 'projects',
      header: t('columns.projects'),
      align: 'end',
      cell: (row) => <span className="tabular-nums">{row.projects}</span>,
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => (
        <StatusPill
          size="sm"
          tone={row.active ? 'onTrack' : 'neutral'}
          label={t(row.active ? 'on' : 'off')}
        />
      ),
    },
    {
      key: 'edit',
      header: t('columns.edit'),
      align: 'end',
      cell: (row) => (
        <Button
          variant="quiet"
          size="sm"
          leadingIcon={<Pencil />}
          onClick={() => setEditing(row)}
          className="relative z-[2]"
        >
          {t('edit')}
        </Button>
      ),
    },
  ];

  return (
    <section className="flex max-w-5xl flex-col gap-5">
      <div className="flex max-w-2xl flex-col gap-1">
        <h2 className="type-display-md text-ink">{t('title')}</h2>
        <p className="type-body text-ink-muted">{t('intro')}</p>
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
      <p className="max-w-2xl type-body-sm text-ink-faint">{t('newKind')}</p>
      <ProjectTypeDialog variant={editing} onClose={() => setEditing(null)} />
    </section>
  );
}
