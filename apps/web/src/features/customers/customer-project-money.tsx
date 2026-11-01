'use client';

import type { CustomerMilestone, CustomerProjectMoney } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  type PillTone,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr, formatInrCompact } from '@oneohm/shared';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

const STATUS_TONE: Readonly<Record<CustomerMilestone['status'], PillTone>> = {
  upcoming: 'neutral',
  due: 'atRisk',
  partly_paid: 'waiting',
  paid: 'done',
};

const money = (paise: number) => (
  <span className="whitespace-nowrap font-mono tabular-nums">{formatInr(paise)}</span>
);

/** One project's payment schedule: each milestone with what came in and what is left. */
export function ProjectMoneyCard({ project }: { readonly project: CustomerProjectMoney }) {
  const t = useTranslations('customers.money');
  const format = useFormatter();
  const scheduled = project.milestones.reduce((sum, row) => sum + row.amountPaise, 0);
  const received = project.milestones.reduce((sum, row) => sum + row.paidPaise, 0);
  const outstanding = project.milestones.reduce((sum, row) => sum + row.outstandingPaise, 0);

  const columns: TableColumn<CustomerMilestone>[] = [
    {
      key: 'milestone',
      header: t('columns.milestone'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="type-body text-ink">{row.label}</span>
          <span className="type-body-sm text-ink-faint">
            {row.payer === 'bank' && `${t('bank')} · `}
            {row.dueOn
              ? t('dueOn', {
                  date: format.dateTime(new Date(row.dueOn), { day: 'numeric', month: 'short' }),
                })
              : t('notDueYet')}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => (
        <StatusPill tone={STATUS_TONE[row.status]} label={t(`status.${row.status}`)} size="sm" />
      ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      cell: (row) => money(row.amountPaise),
    },
    { key: 'paid', header: t('columns.paid'), align: 'end', cell: (row) => money(row.paidPaise) },
    {
      key: 'outstanding',
      header: t('columns.outstanding'),
      align: 'end',
      cell: (row) => (
        <span
          className={
            row.outstandingPaise > 0 && row.status !== 'upcoming'
              ? 'whitespace-nowrap font-mono font-medium text-at-risk tabular-nums'
              : 'whitespace-nowrap font-mono text-ink-muted tabular-nums'
          }
        >
          {formatInr(row.outstandingPaise)}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{project.code}</span>
            {project.status === 'cancelled' && <Badge variant="soft">{t('cancelled')}</Badge>}
          </span>
        }
        description={
          outstanding > 0
            ? t('projectBody', {
                received: formatInrCompact(received),
                scheduled: formatInrCompact(scheduled),
                outstanding: formatInrCompact(outstanding),
              })
            : t('projectSettled', { received: formatInrCompact(received) })
        }
        action={
          <Button asChild variant="quiet" size="sm" trailingIcon={<ArrowUpRight />}>
            <Link href={`/projects/${project.id}?tab=payments`}>{t('openProject')}</Link>
          </Button>
        }
      />
      {project.milestones.length === 0 ? (
        <p className="border-t border-hairline px-5 py-4 type-body-sm text-ink-faint">
          {t('noMilestones')}
        </p>
      ) : (
        <ResponsiveTable
          caption={project.code}
          columns={columns}
          rows={project.milestones}
          rowKey={(row) => row.id}
          className="px-3 pb-3 md:px-1 md:pb-1"
        />
      )}
    </Card>
  );
}
