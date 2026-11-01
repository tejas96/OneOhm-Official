'use client';

import type { SubsidyRuleVersion } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { SUBSIDY_CATEGORIES } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { ListChecks, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { useSubsidyRules } from '../use-settings';
import { SubsidyImpactSheet } from './subsidy-impact';
import { type RuleActions, SubsidyRuleCard } from './subsidy-rule-card';
import { SubsidyRuleSheet } from './subsidy-rule-sheet';
import { WithdrawRuleDialog } from './withdraw-rule-dialog';

interface EditorState {
  /** A fresh form each time the sheet opens. */
  readonly key: number;
  readonly open: boolean;
  readonly rule: SubsidyRuleVersion | null;
}

/**
 * PM Surya Ghar rules as the price engine applies them (PRD 3.5): the version in force per
 * category, versions that start later (editable until then) and the history. A change is
 * followed by the open quotations it would touch; accepted ones never change.
 */
export function SubsidyRules() {
  const t = useTranslations('settings.subsidy');
  const rules = useSubsidyRules();
  const canManage = useCan('subsidy.manage');
  const [editor, setEditor] = useState<EditorState>({ key: 0, open: false, rule: null });
  const [withdrawing, setWithdrawing] = useState<SubsidyRuleVersion | null>(null);
  const [impactOn, setImpactOn] = useState<string | null>(null);

  const openEditor = (rule: SubsidyRuleVersion | null) =>
    setEditor((current) => ({ key: current.key + 1, open: true, rule }));
  const actions: RuleActions = {
    canManage,
    onEdit: openEditor,
    onWithdraw: setWithdrawing,
    onCheck: setImpactOn,
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="type-display-md text-ink">{t('title')}</h2>
          <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" leadingIcon={<Plus />} onClick={() => openEditor(null)}>
              {t('add')}
            </Button>
            <Button
              variant="quiet"
              leadingIcon={<ListChecks />}
              onClick={() => setImpactOn(todayIn())}
            >
              {t('check')}
            </Button>
          </div>
        )}
      </div>
      {rules.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {rules.isError && <LoadError error={rules.error} onRetry={() => rules.refetch()} />}
      {rules.data && (
        <ul className="grid items-start gap-3 lg:grid-cols-3">
          {SUBSIDY_CATEGORIES.map((category) => (
            <li key={category} className="h-full">
              <SubsidyRuleCard
                category={category}
                versions={rules.data.filter((rule) => rule.category === category)}
                actions={actions}
              />
            </li>
          ))}
        </ul>
      )}
      {canManage && rules.data && (
        <SubsidyRuleSheet
          key={editor.key}
          open={editor.open}
          editing={editor.rule}
          rules={rules.data}
          onClose={() => setEditor((current) => ({ ...current, open: false }))}
        />
      )}
      <WithdrawRuleDialog rule={withdrawing} onClose={() => setWithdrawing(null)} />
      <SubsidyImpactSheet asOf={impactOn} onClose={() => setImpactOn(null)} />
    </section>
  );
}
