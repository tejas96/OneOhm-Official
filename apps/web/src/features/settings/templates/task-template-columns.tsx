'use client';

import type { TaskTemplateRecord } from '@oneohm/api-contracts';
import { Badge, IconButton, StatusPill, type TableColumn } from '@oneohm/design-system/web';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Columns for the task library: name, stage, owner, timing, customer reach and order. */
export function useTaskColumns({
  roleName,
  onEdit,
  onMove,
  canMove,
}: {
  readonly roleName: (key: string) => string;
  readonly onEdit: (row: TaskTemplateRecord) => void;
  readonly onMove: (row: TaskTemplateRecord, direction: 'up' | 'down') => void;
  readonly canMove: boolean;
}): readonly TableColumn<TaskTemplateRecord>[] {
  const t = useTranslations('settings.taskTemplates');
  const stageT = useTranslations('stages');
  return [
    {
      key: 'task',
      header: t('columns.task'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={() => onEdit(row)}
            className="oh-stretched-link text-left type-body font-medium text-ink hover:text-accent"
          >
            {row.title}
          </button>
          <span className="truncate font-mono text-[0.75rem] text-ink-faint">{row.key}</span>
        </span>
      ),
    },
    { key: 'stage', header: t('columns.stage'), cell: (row) => stageT(row.stage) },
    { key: 'who', header: t('columns.who'), cell: (row) => roleName(row.roleKey) },
    {
      key: 'when',
      header: t('columns.when'),
      cell: (row) => (
        <span className="type-body-sm text-ink-muted tabular-nums">
          {t('when', { offset: row.offsetDays, count: row.durationDays })}
        </span>
      ),
    },
    {
      key: 'customer',
      header: t('columns.customer'),
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {row.notifyCustomer ? (
            <StatusPill
              size="sm"
              tone="review"
              label={t('messages', { event: t(`events.${row.notifyEvent}`) })}
            />
          ) : (
            <Badge variant="outline">{row.customerVisible ? t('visible') : t('internal')}</Badge>
          )}
          {row.approval && <Badge variant="soft">{t('approval')}</Badge>}
          {!row.active && <StatusPill size="sm" tone="neutral" label={t('off')} />}
        </span>
      ),
    },
    {
      key: 'order',
      header: t('columns.order'),
      align: 'end',
      cell: (row) =>
        canMove ? (
          <span className="relative z-[2] inline-flex gap-1">
            <IconButton
              size="sm"
              variant="quiet"
              label={t('moveUp', { title: row.title })}
              onClick={() => onMove(row, 'up')}
            >
              <ChevronUp />
            </IconButton>
            <IconButton
              size="sm"
              variant="quiet"
              label={t('moveDown', { title: row.title })}
              onClick={() => onMove(row, 'down')}
            >
              <ChevronDown />
            </IconButton>
          </span>
        ) : null,
    },
  ];
}
