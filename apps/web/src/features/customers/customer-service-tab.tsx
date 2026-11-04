'use client';

import type { CustomerActivity, CustomerServiceRequest } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  CardHeader,
  type PillTone,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';
import { CustomerAftercareCard } from './customer-aftercare-card';
import { CustomerFeedbackCard, CustomerReferralsCard } from './customer-feedback';

const STATUS_TONE: Readonly<Record<CustomerServiceRequest['status'], PillTone>> = {
  open: 'atRisk',
  in_progress: 'review',
  resolved: 'done',
};

/**
 * After-sales: every service request, warranty and AMC cover, how the customer rated us,
 * and who they referred.
 */
export function CustomerServiceTab({ activity }: { readonly activity: CustomerActivity }) {
  return (
    <div className="flex flex-col gap-6">
      <ServiceRequestsCard requests={activity.serviceRequests} />
      <CustomerAftercareCard aftercare={activity.aftercare} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <CustomerFeedbackCard feedback={activity.feedback} />
        <CustomerReferralsCard referrals={activity.referrals} />
      </div>
    </div>
  );
}

function ServiceRequestsCard({
  requests,
}: {
  readonly requests: readonly CustomerServiceRequest[];
}) {
  const t = useTranslations('customers.service');
  const format = useFormatter();
  const canOpenDesk = useCan('service.manage', 'customers.view');
  const columns: TableColumn<CustomerServiceRequest>[] = [
    {
      key: 'request',
      header: t('columns.request'),
      primary: true,
      cell: (request) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          {canOpenDesk ? (
            <Link
              href={`/service?tab=requests&view=all&request=${request.id}`}
              className="type-body font-medium text-ink hover:text-accent"
            >
              {request.categoryLabel}
            </Link>
          ) : (
            <span className="type-body font-medium text-ink">{request.categoryLabel}</span>
          )}
          <span className="line-clamp-2 type-body-sm text-ink-muted">{request.description}</span>
          {request.resolutionNote && (
            <span className="line-clamp-2 type-body-sm text-ink-faint">
              {t('resolution', { note: request.resolutionNote })}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (request) => (
        <StatusPill
          tone={STATUS_TONE[request.status]}
          label={t(`status.${request.status}`)}
          size="sm"
        />
      ),
    },
    {
      key: 'project',
      header: t('columns.project'),
      cell: (request) =>
        request.project ? (
          <Link
            href={`/projects/${request.project.id}`}
            className="whitespace-nowrap font-mono text-[0.8125rem] text-ink hover:text-accent"
          >
            {request.project.code}
          </Link>
        ) : (
          <span className="text-ink-faint">{t('noProject')}</span>
        ),
    },
    {
      key: 'raised',
      header: t('columns.raised'),
      cell: (request) => (
        <span className="whitespace-nowrap type-body-sm text-ink-muted">
          {format.dateTime(new Date(request.createdAt), { day: 'numeric', month: 'short' })}
        </span>
      ),
    },
    {
      key: 'handledBy',
      header: t('columns.handledBy'),
      hideOnPhone: true,
      cell: (request) => (
        <span className="whitespace-nowrap type-body-sm text-ink-muted">
          {request.assigneeName ?? t('unassigned')}
        </span>
      ),
    },
  ];
  return (
    <Card className="min-w-0">
      <CardHeader
        title={t('requestsTitle')}
        description={t('requestsBody')}
        action={
          canOpenDesk && (
            <Button asChild variant="quiet" size="sm" trailingIcon={<ArrowUpRight />}>
              <Link href="/service?tab=requests">{t('openDesk')}</Link>
            </Button>
          )
        }
      />
      {requests.length === 0 ? (
        <p className="border-t border-hairline px-5 py-4 type-body-sm text-ink-faint">
          {t('requestsNone')}
        </p>
      ) : (
        <ResponsiveTable
          caption={t('requestsTitle')}
          columns={columns}
          rows={requests}
          rowKey={(request) => request.id}
          className="px-3 pb-3 md:px-1 md:pb-1"
        />
      )}
    </Card>
  );
}
