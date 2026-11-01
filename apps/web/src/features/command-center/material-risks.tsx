'use client';

import type { MaterialRisks } from '@oneohm/api-contracts';
import { Card, CardHeader } from '@oneohm/design-system/web';
import { ChevronRight, PackageCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

const quantity = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 2 });

interface Row {
  readonly key: string;
  readonly href: string;
  readonly title: ReactNode;
  readonly detail: string;
}

/**
 * Material shortages and procurement risks (PRD 3.1): items below their reorder level,
 * purchase orders past their expected date, and projects about to need material they
 * do not have. Each row opens the order, the stock or the project's material tab.
 */
export function MaterialRiskCard({ materials }: { readonly materials: MaterialRisks }) {
  const t = useTranslations('commandCenter.materials');
  const { counts } = materials;
  const groups: readonly { key: keyof MaterialRisks['counts']; all: string; rows: Row[] }[] = [
    {
      key: 'shortProjects',
      all: '/inventory?tab=requests',
      rows: materials.shortProjects.map((row) => ({
        key: row.projectId,
        href: `/projects/${row.projectId}?tab=material`,
        title: (
          <>
            <span className="font-mono text-[0.75rem] text-ink-faint">{row.projectCode}</span>{' '}
            {row.projectName}
          </>
        ),
        detail: row.items
          .map((item) =>
            t('shortItem', { quantity: quantity(item.short), unit: item.unit, name: item.name }),
          )
          .join(' · '),
      })),
    },
    {
      key: 'latePurchaseOrders',
      all: '/inventory?tab=orders',
      rows: materials.latePurchaseOrders.map((row) => ({
        key: row.id,
        href: `/inventory?tab=orders&order=${row.id}`,
        title: (
          <>
            <span className="font-mono text-[0.75rem] text-ink-faint">{row.number}</span>{' '}
            {row.vendorName}
          </>
        ),
        detail: t('lateOrder', { days: row.daysLate, project: row.projectCode ?? t('forStock') }),
      })),
    },
    {
      key: 'belowReorder',
      all: '/inventory?tab=stock',
      rows: materials.belowReorder.map((row) => ({
        key: row.productId,
        href: '/inventory?tab=stock',
        title: row.name,
        detail: t('reorder', {
          free: quantity(row.free),
          minimum: quantity(row.minimum),
          unit: row.unit,
        }),
      })),
    },
  ];
  const total = counts.belowReorder + counts.latePurchaseOrders + counts.shortProjects;
  return (
    <Card className="flex flex-col">
      <CardHeader title={t('title')} description={t('description')} />
      {total === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 type-body-sm text-ink-muted">
          <PackageCheck aria-hidden className="size-4 text-on-track" />
          {t('empty')}
        </p>
      ) : (
        <div className="flex flex-col gap-4 px-5 pb-5">
          {groups
            .filter((group) => counts[group.key] > 0)
            .map((group) => (
              <section key={group.key} className="flex flex-col gap-1">
                <h3 className="flex items-baseline justify-between gap-3 type-overline text-ink-faint uppercase">
                  {t(`groups.${group.key}`, { count: counts[group.key] })}
                  {counts[group.key] > group.rows.length && (
                    <Link href={group.all} className="normal-case text-accent hover:underline">
                      {t('more', { count: counts[group.key] - group.rows.length })}
                    </Link>
                  )}
                </h3>
                <ul className="flex flex-col divide-y divide-hairline">
                  {group.rows.map((row) => (
                    <li key={row.key}>
                      <Link
                        href={row.href}
                        className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-sunken/60"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate type-body-sm text-ink">{row.title}</span>
                          <span className="type-label text-ink-muted">{row.detail}</span>
                        </span>
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </Card>
  );
}
