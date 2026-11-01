'use client';

import type { StateSubsidyVersion } from '@oneohm/api-contracts';
import { Badge, Button } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ChevronRight, Pencil, Plus, Undo2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { StateRuleSheet } from './state-rule-sheet';
import { useStateRules } from './use-state-rules';
import { WithdrawStateRuleDialog } from './withdraw-state-rule-dialog';

function RuleLines({ rule }: { readonly rule: StateSubsidyVersion }) {
  const t = useTranslations('stateSupport');
  return (
    <ul className="flex flex-col gap-1.5 type-body-sm text-ink-muted">
      <li>{t('rate', { rate: formatInr(rule.paisePerKw) })}</li>
      <li className="font-medium text-ink">{t('cap', { amount: formatInr(rule.capPaise) })}</li>
    </ul>
  );
}

/**
 * Maharashtra's low-income top-up (PRD 3.5), next to the PM Surya Ghar rules: off until a
 * version is added; then low-income homes see it as its own line on quotations.
 */
export function StateSupportSection() {
  const t = useTranslations('stateSupport');
  const format = useFormatter();
  const rules = useStateRules();
  const canManage = useCan('subsidy.manage');
  const [editor, setEditor] = useState({
    key: 0,
    open: false,
    rule: null as StateSubsidyVersion | null,
  });
  const [withdrawing, setWithdrawing] = useState<StateSubsidyVersion | null>(null);
  const day = (date: string) => format.dateTime(new Date(date), { dateStyle: 'medium' });
  const versions = rules.data ?? [];
  const current = versions.find((rule) => rule.status === 'in_force') ?? null;
  const scheduled = versions.filter((rule) => rule.status === 'scheduled').reverse();
  const earlier = versions.filter((rule) => rule.status === 'earlier');
  const openEditor = (rule: StateSubsidyVersion | null) =>
    setEditor((now) => ({ key: now.key + 1, open: true, rule }));

  return (
    <section className="flex flex-col gap-4 border-t border-hairline pt-8">
      <div className="flex flex-col gap-1">
        <h2 className="type-title-lg text-ink">{t('title')}</h2>
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      </div>
      {rules.isPending && <ListSkeleton label={t('loading')} rows={1} />}
      {rules.isError && <LoadError error={rules.error} onRetry={() => rules.refetch()} />}
      {rules.data && (
        <article className="flex max-w-xl flex-col gap-4 rounded-2xl bg-raised p-5 shadow-e1 ring-1 ring-hairline/70">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="type-title-md text-ink">{t('lowIncome')}</h3>
              <p className="font-mono text-[0.75rem] text-ink-faint">
                {current ? t('inForceSince', { date: day(current.validFrom) }) : t('off')}
              </p>
            </div>
            {canManage && (
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<Plus />}
                onClick={() => openEditor(null)}
              >
                {t('add')}
              </Button>
            )}
          </header>
          {current ? (
            <RuleLines rule={current} />
          ) : (
            <p className="type-body-sm text-ink-muted">{t('offHint')}</p>
          )}
          {scheduled.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-col gap-3 rounded-xl border border-dashed border-rule bg-sunken/50 p-4"
            >
              <Badge variant="accent" className="self-start">
                {t('startsOn', { date: day(rule.validFrom) })}
              </Badge>
              <RuleLines rule={rule} />
              {canManage && (
                <div className="-ml-2 flex flex-wrap gap-1">
                  <Button
                    variant="quiet"
                    size="sm"
                    leadingIcon={<Pencil />}
                    onClick={() => openEditor(rule)}
                  >
                    {t('edit')}
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    leadingIcon={<Undo2 />}
                    onClick={() => setWithdrawing(rule)}
                  >
                    {t('withdraw')}
                  </Button>
                </div>
              )}
            </div>
          ))}
          {earlier.length > 0 && (
            <details className="group border-t border-hairline pt-3">
              <summary className="flex cursor-pointer list-none items-center gap-1 type-body-sm text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  aria-hidden
                  className="size-4 transition-transform group-open:rotate-90"
                />
                {t('earlier', { count: earlier.length })}
              </summary>
              <ul className="mt-3 flex flex-col gap-4">
                {earlier.map((rule) => (
                  <li key={rule.id} className="flex flex-col gap-2">
                    <p className="font-mono text-[0.75rem] text-ink-faint">
                      {t('validFrom', { date: day(rule.validFrom) })}
                    </p>
                    <RuleLines rule={rule} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </article>
      )}
      {canManage && (
        <StateRuleSheet
          key={editor.key}
          open={editor.open}
          editing={editor.rule}
          current={current}
          onClose={() => setEditor((now) => ({ ...now, open: false }))}
        />
      )}
      <WithdrawStateRuleDialog rule={withdrawing} onClose={() => setWithdrawing(null)} />
    </section>
  );
}
