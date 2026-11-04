'use client';

import type { TaskTemplateRecord } from '@oneohm/api-contracts';
import {
  Button,
  Checkbox,
  Input,
  ResponsiveTable,
  Select,
  useToast,
} from '@oneohm/design-system/web';
import { EPC_STAGES, type EpcStage } from '@oneohm/domain';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useTaskColumns } from './task-template-columns';
import { TaskTemplateSheet } from './task-template-sheet';
import { TEMPLATE_KEYS, useRoleOptions, useTaskTemplates } from './use-templates';

type StageFilter = EpcStage | 'all';

/** The task library new projects are built from, in order, with who is told what (PRD 3.7). */
export function TaskTemplatesPanel() {
  const t = useTranslations('settings.taskTemplates');
  const stageT = useTranslations('stages');
  const toast = useToast();
  const client = useQueryClient();
  const query = useTaskTemplates();
  const roles = useRoleOptions();
  const [stage, setStage] = useState<StageFilter>('all');
  const [search, setSearch] = useState('');
  const [showOff, setShowOff] = useState(false);
  const [editing, setEditing] = useState<TaskTemplateRecord | 'new' | null>(null);
  const roleName = (key: string) => roles.data?.find((role) => role.value === key)?.label ?? key;
  const filtering = stage !== 'all' || search.trim() !== '' || showOff;

  const move = async (row: TaskTemplateRecord, direction: 'up' | 'down') => {
    try {
      const next = await expectStatus(
        api.templates.moveTaskTemplate({ params: { id: row.id }, body: { direction } }),
        200,
      );
      client.setQueryData(TEMPLATE_KEYS.tasks, next);
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };
  const columns = useTaskColumns({
    roleName,
    onEdit: setEditing,
    onMove: move,
    canMove: !filtering,
  });
  const words = search.trim().toLowerCase();
  const rows = (query.data ?? []).filter(
    (row) =>
      (showOff || row.active) &&
      (stage === 'all' || row.stage === stage) &&
      (!words || `${row.title} ${row.key}`.toLowerCase().includes(words)),
  );

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="type-display-md text-ink">{t('title')}</h2>
          <p className="type-body text-ink-muted">{t('intro')}</p>
        </div>
        <Button variant="secondary" leadingIcon={<Plus />} onClick={() => setEditing('new')}>
          {t('add')}
        </Button>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            className="pl-9"
          />
        </div>
        <Select<StageFilter>
          label={t('stageFilter')}
          value={stage}
          onValueChange={setStage}
          className="md:w-56"
          options={[
            { value: 'all', label: t('allStages') },
            ...EPC_STAGES.map((value) => ({ value, label: stageT(value) })),
          ]}
        />
        <Checkbox checked={showOff} onCheckedChange={setShowOff} label={t('showOff')} />
        <span className="type-body-sm text-ink-faint md:ml-auto">
          {t('count', { count: rows.length })}
        </span>
      </div>
      {query.isPending && <ListSkeleton label={t('loading')} rows={8} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && rows.length === 0 && (
        <p className="py-6 type-body text-ink-muted">{t('empty')}</p>
      )}
      {rows.length > 0 && (
        <ResponsiveTable
          caption={t('title')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
        />
      )}
      <TaskTemplateSheet
        open={editing !== null}
        template={editing === 'new' ? null : editing}
        all={query.data ?? []}
        roles={roles.data ?? []}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}
