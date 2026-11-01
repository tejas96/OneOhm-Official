'use client';

import type { ChangeRequestTypeSetting, Discom } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { FileCog, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { ChangeTypeSheet } from './change-type-sheet';
import { useChangeTypes } from './use-discom-setup';

type Editing = ChangeRequestTypeSetting | 'new' | null;

/** One DISCOM's change requests: what each asks for, its steps and what it holds back. */
export function ChangeTypesSection({ discom }: { readonly discom: Discom }) {
  const t = useTranslations('discomSetup');
  const fieldT = useTranslations('discom.fields');
  const stageT = useTranslations('stages');
  const types = useChangeTypes(discom.id);
  const [editing, setEditing] = useState<Editing>(null);
  const [opening, setOpening] = useState(0);
  const open = (next: Editing) => {
    setOpening((count) => count + 1);
    setEditing(next);
  };

  const columns: readonly TableColumn<ChangeRequestTypeSetting>[] = [
    {
      key: 'change',
      header: t('changes.columns.change'),
      primary: true,
      cell: (type) => (
        <span className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={() => open(type)}
            className="oh-stretched-link text-left type-body font-medium text-ink hover:text-accent"
          >
            {type.title}
          </button>
          <span className="type-body-sm text-ink-faint">{type.description}</span>
        </span>
      ),
    },
    {
      key: 'asks',
      header: t('changes.columns.asks'),
      cell: (type) =>
        type.fields.length
          ? type.fields.map((field) => fieldT(field.key)).join(', ')
          : t('changes.nothing'),
    },
    {
      key: 'steps',
      header: t('changes.columns.steps'),
      cell: (type) => (
        <span className="tabular-nums">
          {t('changes.stepsSummary', {
            count: type.steps.length,
            days: type.steps.reduce((sum, step) => sum + step.durationDays, 0),
          })}
        </span>
      ),
    },
    {
      key: 'holds',
      header: t('changes.columns.holds'),
      cell: (type) => {
        const held = [
          ...type.blocks.stages.map((stage) => stageT(stage)),
          ...(type.blocks.taskKeys.length
            ? [t('changes.heldTasks', { count: type.blocks.taskKeys.length })]
            : []),
        ];
        return held.length ? held.join(', ') : t('changes.nothing');
      },
    },
    {
      key: 'status',
      header: t('changes.columns.status'),
      cell: (type) => (
        <span className="flex flex-col items-start gap-1">
          <StatusPill
            size="sm"
            tone={type.active ? 'onTrack' : 'neutral'}
            label={type.active ? t('on') : t('off')}
          />
          {type.openRequests > 0 && (
            <span className="type-body-sm text-ink-faint">
              {t('changes.openRequests', { count: type.openRequests })}
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="type-display-md text-ink">{t('changes.title')}</h2>
          <p className="max-w-2xl type-body text-ink-muted">{t('changes.intro')}</p>
        </div>
        <Button variant="secondary" leadingIcon={<Plus />} onClick={() => open('new')}>
          {t('changes.add')}
        </Button>
      </div>
      {types.isPending && <ListSkeleton label={t('changes.loading')} rows={4} />}
      {types.isError && <LoadError error={types.error} onRetry={() => types.refetch()} />}
      {types.data && types.data.length === 0 && (
        <EmptyState
          icon={<FileCog />}
          title={t('changes.emptyTitle')}
          description={t('changes.emptyBody')}
        />
      )}
      {types.data && types.data.length > 0 && (
        <ResponsiveTable
          caption={t('changes.title')}
          columns={columns}
          rows={types.data}
          rowKey={(type) => type.id}
        />
      )}
      {editing && (
        <ChangeTypeSheet
          key={opening}
          discom={discom}
          editing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
