'use client';

import type { ProjectChangeImpact } from '@oneohm/api-contracts';
import { Badge, cn } from '@oneohm/design-system/web';
import { formatInr, formatKwp } from '@oneohm/shared';
import { ArrowRight } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ChangeScopeLines } from './change-scope-lines';

const signed = (paise: number) => `${paise >= 0 ? '+' : '−'}${formatInr(Math.abs(paise))}`;

function MoneyRow({
  label,
  before,
  after,
  difference,
  note,
  strong = false,
}: {
  readonly label: string;
  readonly before: number;
  readonly after: number;
  readonly difference: number;
  readonly note?: string | null | undefined;
  readonly strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-hairline py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <dt className={cn('type-body', strong ? 'text-ink' : 'text-ink-muted')}>{label}</dt>
        <dd className="flex items-baseline gap-2 font-mono tabular-nums">
          <span className="text-ink-faint">{formatInr(before)}</span>
          <ArrowRight aria-hidden className="size-3.5 self-center text-ink-faint" />
          <span className={cn(strong ? 'text-ink' : 'text-ink-muted')}>{formatInr(after)}</span>
          {difference !== 0 && (
            <span className={cn('type-body-sm', difference > 0 ? 'text-at-risk' : 'text-on-track')}>
              {signed(difference)}
            </span>
          )}
        </dd>
      </div>
      {note && <p className="type-body-sm text-ink-faint">{note}</p>}
    </div>
  );
}

function Block({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="type-overline text-ink-faint uppercase">{title}</h4>
      {children}
    </section>
  );
}

/** Price, subsidy, state support and which payment takes the difference. */
function MoneyBlock({ impact }: { readonly impact: ProjectChangeImpact }) {
  const t = useTranslations('scopeChanges.impact');
  const reasonT = useTranslations('quotations.ineligible');
  const { price, payment } = impact;
  const lostReason =
    price.after.subsidyPaise === 0 && price.after.subsidyIneligible
      ? reasonT(price.after.subsidyIneligible as 'non_dcr_panels')
      : null;
  const hasState = price.before.stateSupportPaise > 0 || price.after.stateSupportPaise > 0;
  return (
    <Block title={t('money')}>
      <dl className="flex flex-col">
        <MoneyRow
          strong
          label={t('price')}
          before={price.before.totalPaise}
          after={price.after.totalPaise}
          difference={price.differencePaise}
          note={
            price.differencePaise === 0
              ? null
              : payment.label && payment.newAmountPaise !== null
                ? t('paymentTakes', {
                    label: payment.label,
                    amount: formatInr(payment.newAmountPaise),
                  })
                : t('paymentFinance')
          }
        />
        <MoneyRow
          label={t('subsidy')}
          before={price.before.subsidyPaise}
          after={price.after.subsidyPaise}
          difference={price.subsidyDifferencePaise}
          note={price.subsidyDifferencePaise !== 0 ? lostReason : null}
        />
        {hasState && (
          <MoneyRow
            label={t('stateSupport')}
            before={price.before.stateSupportPaise}
            after={price.after.stateSupportPaise}
            difference={price.stateSupportDifferencePaise}
          />
        )}
        <MoneyRow
          label={t('effective')}
          before={price.before.effectivePaise}
          after={price.after.effectivePaise}
          difference={price.effectiveDifferencePaise}
          note={t('effectiveNote')}
        />
      </dl>
    </Block>
  );
}

/** Tasks added, taken off or kept, and where the finish lands. */
function TimelineBlock({ tasks }: { readonly tasks: ProjectChangeImpact['tasks'] }) {
  const t = useTranslations('scopeChanges.impact');
  const format = useFormatter();
  const day = (date: string) => format.dateTime(new Date(date), { day: 'numeric', month: 'short' });
  const finish =
    tasks.finishMoveDays === 0
      ? t('finishSame', { date: tasks.finishAfter ? day(tasks.finishAfter) : '—' })
      : t(tasks.finishMoveDays > 0 ? 'finishLater' : 'finishSooner', {
          days: Math.abs(tasks.finishMoveDays),
          from: tasks.finishBefore ? day(tasks.finishBefore) : '—',
          to: tasks.finishAfter ? day(tasks.finishAfter) : '—',
        });
  const none = tasks.added.length + tasks.removed.length + tasks.kept.length === 0;
  return (
    <Block title={t('timeline')}>
      <p className={cn('type-body', tasks.finishMoveDays > 0 ? 'text-at-risk' : 'text-ink')}>
        {finish}
      </p>
      {none && <p className="type-body-sm text-ink-muted">{t('noTasks')}</p>}
      <ul className="flex flex-col gap-1.5 type-body-sm">
        {tasks.added.map((task) => (
          <li key={`a-${task.key}`} className="flex flex-wrap items-center gap-2 text-ink">
            <Badge variant="soft" className="py-0">
              {t('added')}
            </Badge>
            {task.title}
            <span className="font-mono text-[0.75rem] text-ink-faint">
              {day(task.startDate)} – {day(task.dueDate)}
            </span>
          </li>
        ))}
        {tasks.removed.map((task) => (
          <li key={`r-${task.key}`} className="flex flex-wrap items-center gap-2 text-ink-muted">
            <Badge variant="outline" className="py-0">
              {t('removed')}
            </Badge>
            {task.title}
          </li>
        ))}
        {tasks.kept.map((task) => (
          <li key={`k-${task.key}`} className="flex flex-wrap items-center gap-2 text-ink-muted">
            <Badge variant="accent" className="py-0">
              {t('kept')}
            </Badge>
            {task.title}
          </li>
        ))}
      </ul>
      {tasks.moved > 0 && (
        <p className="type-body-sm text-ink-faint">{t('moved', { count: tasks.moved })}</p>
      )}
    </Block>
  );
}

/** Material that changes, with what the store already holds for the project. */
function MaterialBlock({ material }: { readonly material: ProjectChangeImpact['material'] }) {
  const t = useTranslations('scopeChanges.impact');
  if (material.length === 0) return null;
  return (
    <Block title={t('material')}>
      <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-hairline">
        {material.map((row) => (
          <li
            key={row.productId}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2.5"
          >
            <span className="type-body-sm text-ink">{row.name}</span>
            <span className="flex items-baseline gap-2 font-mono text-[0.8125rem] tabular-nums text-ink-muted">
              {row.before} → {row.after} {row.unit}
              <span className={row.delta > 0 ? 'text-at-risk' : 'text-on-track'}>
                ({row.delta > 0 ? '+' : ''}
                {row.delta})
              </span>
              {row.reserved > 0 && (
                <span className="text-ink-faint">{t('reserved', { count: row.reserved })}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

/** Everything people see before approving (PRD 3.15): plain, one block at a time. */
export function ChangeImpactView({
  impact,
  updating = false,
}: {
  readonly impact: ProjectChangeImpact;
  readonly updating?: boolean;
}) {
  const t = useTranslations('scopeChanges.impact');
  return (
    <div
      className={cn('flex flex-col gap-6 transition-opacity', updating && 'opacity-60')}
      aria-busy={updating || undefined}
    >
      <Block title={t('scope')}>
        <ChangeScopeLines scope={impact.scope} />
        <p className="font-mono text-[0.75rem] text-ink-faint">
          {formatKwp(impact.scope.before.capacityWp)} → {formatKwp(impact.scope.after.capacityWp)}
        </p>
      </Block>
      <MoneyBlock impact={impact} />
      <TimelineBlock tasks={impact.tasks} />
      <MaterialBlock material={impact.material} />
    </div>
  );
}
