'use client';

import type { DocumentRequirementRecord } from '@oneohm/api-contracts';
import { Button, IconButton, Switch } from '@oneohm/design-system/web';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { RequirementDialog } from './requirement-dialog';
import { useRuleSummary } from './rule-summary';
import { useChangeRequirements, useRequirements } from './use-requirements';

/**
 * The papers every project's checklist asks for (PRD 3.14), with the rule for when each
 * applies. Switching one off removes it from every checklist; the files stay.
 */
export function RequirementsPanel() {
  const t = useTranslations('settings.requirements');
  const query = useRequirements();
  const change = useChangeRequirements();
  const summary = useRuleSummary();
  // undefined: closed; null: a new paper.
  const [editing, setEditing] = useState<DocumentRequirementRecord | null | undefined>(undefined);
  if (query.isPending) return <ListSkeleton label={t('loading')} rows={6} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const list = query.data;
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline bg-raised">
        {list.map((item, index) => (
          <li key={item.key} className="flex items-center gap-1 py-1 pr-2 pl-4">
            <Switch
              className="min-w-0 flex-1"
              checked={item.active}
              disabled={change.isPending}
              onCheckedChange={(active) =>
                change.mutate({ kind: 'update', key: item.key, body: { active } })
              }
              label={item.label}
              description={summary(item)}
            />
            <IconButton
              size="sm"
              label={t('up', { name: item.label })}
              disabled={index === 0 || change.isPending}
              onClick={() => change.mutate({ kind: 'update', key: item.key, body: { move: 'up' } })}
            >
              <ArrowUp aria-hidden />
            </IconButton>
            <IconButton
              size="sm"
              label={t('down', { name: item.label })}
              disabled={index === list.length - 1 || change.isPending}
              onClick={() =>
                change.mutate({ kind: 'update', key: item.key, body: { move: 'down' } })
              }
            >
              <ArrowDown aria-hidden />
            </IconButton>
            <IconButton
              size="sm"
              label={t('edit', { name: item.label })}
              onClick={() => setEditing(item)}
            >
              <Pencil aria-hidden />
            </IconButton>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        leadingIcon={<Plus />}
        className="self-start"
        onClick={() => setEditing(null)}
      >
        {t('add')}
      </Button>
      <RequirementDialog
        open={editing !== undefined}
        requirement={editing ?? null}
        onClose={() => setEditing(undefined)}
      />
    </div>
  );
}
