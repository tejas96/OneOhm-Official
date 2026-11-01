'use client';

import type { CustodyProject, ProjectCustody } from '@oneohm/api-contracts';
import { Badge, Button, Card, CardHeader, EmptyState } from '@oneohm/design-system/web';
import { ArrowDownToLine, HardHat, PackageCheck, PackageOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';
import { formatQuantity } from '../use-inventory';
import { settled } from './use-custody';

export type DrawMode = 'use' | 'return';

/**
 * What each contractor's crew holds for this project, with the store's actions:
 * issue more, record what went into the system, take unused material back.
 */
export function CustodyCard({
  custody,
  onIssue,
  onDraw,
}: {
  readonly custody: ProjectCustody;
  readonly onIssue: () => void;
  readonly onDraw: (group: CustodyProject, mode: DrawMode) => void;
}) {
  const t = useTranslations('inventory.custody');
  const canIssue = useCan('inventory.manage');
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title={t('holdingsTitle')}
        description={t('holdingsDescription')}
        action={
          canIssue && custody.contractors.length > 0 ? (
            <Button size="sm" variant="primary" leadingIcon={<PackageOpen />} onClick={onIssue}>
              {t('issue')}
            </Button>
          ) : null
        }
      />
      {custody.holdings.length === 0 ? (
        <div className="border-t border-hairline px-5 py-6">
          <EmptyState
            icon={<HardHat />}
            title={t('holdingsEmpty')}
            description={custody.contractors.length === 0 ? t('noContractor') : undefined}
          />
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {custody.holdings.map((group) => (
            <HoldingGroup key={group.contractor.id} group={group} onDraw={onDraw} />
          ))}
        </div>
      )}
    </Card>
  );
}

function HoldingGroup({
  group,
  onDraw,
}: {
  readonly group: CustodyProject;
  readonly onDraw: (group: CustodyProject, mode: DrawMode) => void;
}) {
  const t = useTranslations('inventory.custody');
  const canUse = useCan('inventory.manage', 'projects.manage', 'tasks.approve');
  const canReturn = useCan('inventory.manage');
  const open = group.holdings.filter((holding) => !settled(holding));
  return (
    <section className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 type-body font-medium text-ink">
          {group.contractor.name}
          {open.length === 0 && <Badge>{t('allAccounted')}</Badge>}
        </h3>
        {open.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {canUse && (
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<PackageCheck />}
                onClick={() => onDraw(group, 'use')}
              >
                {t('recordUse')}
              </Button>
            )}
            {canReturn && (
              <Button
                size="sm"
                variant="quiet"
                leadingIcon={<ArrowDownToLine />}
                onClick={() => onDraw(group, 'return')}
              >
                {t('recordReturn')}
              </Button>
            )}
          </div>
        )}
      </div>
      {open.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {open.map((holding) => (
            <li
              key={`${holding.productId}-${holding.lineKey ?? ''}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"
            >
              <span className="min-w-0 type-body-sm text-ink">{holding.name}</span>
              <span className="font-mono text-[0.8125rem] text-ink tabular-nums">
                {t('holding', { balance: formatQuantity(holding.balance), unit: holding.unit })}
              </span>
              <span className="w-full type-label text-ink-faint">
                {t('holdingLine', {
                  issued: formatQuantity(holding.issued),
                  used: formatQuantity(holding.used),
                  returned: formatQuantity(holding.returned),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
