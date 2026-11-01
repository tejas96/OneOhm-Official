'use client';

import type { WorkOrderDetail } from '@oneohm/api-contracts';
import {
  Card,
  CardHeader,
  pageEnter,
  Skeleton,
  SkeletonGroup,
  StatusPill,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { useWorkOrder } from './use-contractors';
import { WorkOrderActions } from './work-order-actions';
import { WorkOrderSettlement } from './work-order-settlement';
import { WORK_ORDER_TONE } from './work-orders-table';

/** A work order: the tasks it covers, what each line pays, and how it settles. */
export function WorkOrderView({ id }: { readonly id: string }) {
  const t = useTranslations('contractors.workOrder');
  const statusT = useTranslations('contractors.workOrders.status');
  const format = useFormatter();
  const canManage = useCan('contractors.manage');
  const query = useWorkOrder(id);

  if (query.isPending)
    return (
      <SkeletonGroup
        label={t('loading')}
        className="mx-auto flex w-full max-w-[90rem] flex-col gap-6"
      >
        <Skeleton className="h-28 w-1/2 rounded-2xl" />
        <Skeleton className="h-72 rounded-[28px]" />
      </SkeletonGroup>
    );
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const order = query.data;

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      {canManage && (
        <Link
          href={`/contractors/${order.contractor.id}`}
          className="inline-flex w-fit items-center gap-1.5 type-body-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {order.contractor.name}
        </Link>
      )}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-3 font-mono text-[0.75rem] text-ink-faint">
            {order.number}
            <StatusPill
              size="sm"
              tone={order.overdue ? 'overdue' : WORK_ORDER_TONE[order.status]}
              label={statusT(order.status)}
            />
          </p>
          <h1 className="type-display-lg text-balance text-ink">
            <Link href={`/projects/${order.project.id}`} className="hover:text-accent">
              {order.project.code} · {order.project.name}
            </Link>
          </h1>
          <p className="type-body text-ink-muted">
            {order.dueDate
              ? t('due', {
                  date: format.dateTime(new Date(order.dueDate), { day: 'numeric', month: 'long' }),
                })
              : t('noDue')}
            {order.scope && ` · ${order.scope}`}
          </p>
          {order.cancelledReason && (
            <p className="type-body-sm text-overdue">
              {t('cancelled', { reason: order.cancelledReason })}
            </p>
          )}
        </div>
        {canManage && <WorkOrderActions order={order} />}
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <TaskList order={order} />
          <Lines order={order} />
        </div>
        <div className="lg:col-span-5">
          <WorkOrderSettlement order={order} />
        </div>
      </div>
    </motion.div>
  );
}

function TaskList({ order }: { readonly order: WorkOrderDetail }) {
  const t = useTranslations('contractors.workOrder');
  const statusT = useTranslations('projects.task.status');
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title={t('tasks')}
        description={t('tasksDone', { done: order.tasksDone, total: order.taskCount })}
      />
      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {order.tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-3 px-5 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate type-body-sm font-medium text-ink">{task.title}</span>
              <span className="type-label text-ink-faint">
                {task.assignee?.fullName ?? t('unassigned')}
              </span>
            </span>
            <StatusPill
              size="sm"
              tone={task.status === 'completed' ? 'done' : task.overdue ? 'overdue' : 'neutral'}
              label={statusT(task.status)}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Lines({ order }: { readonly order: WorkOrderDetail }) {
  const t = useTranslations('contractors.workOrder');
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title={t('lines')} description={t('linesHint')} />
      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {order.lines.length === 0 && (
          <li className="px-5 py-4 type-body-sm text-ink-muted">{t('noLines')}</li>
        )}
        {order.lines.map((line) => (
          <li key={line.id} className="flex items-baseline gap-3 px-5 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="type-body-sm text-ink">{line.description}</span>
              <span className="font-mono text-[0.75rem] text-ink-faint">
                {(line.quantityMilli / 1000).toLocaleString('en-IN')} ×{' '}
                {formatInr(line.unitRatePaise)}
                {line.manual && ` · ${t('manual')}`}
              </span>
            </span>
            <span className="type-body-sm text-ink tabular-nums">
              {formatInr(line.amountPaise)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
