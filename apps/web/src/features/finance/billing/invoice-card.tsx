'use client';

import type { ProjectBilling, TaxInvoice } from '@oneohm/api-contracts';
import { Button, Card, CardHeader, StatusPill } from '@oneohm/design-system/web';
import { Ban, FileDown, FileText } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { CancelInvoiceDialog } from './cancel-invoice-dialog';
import { InvoiceFigures, ScheduleDifference } from './invoice-figures';
import { IssueInvoiceDialog } from './issue-invoice-dialog';
import { invoicePdfHref, useProjectBilling } from './use-billing';

const day = (value: string) => new Date(`${value}T12:00:00`);

function PdfLink({ invoice, label }: { readonly invoice: TaxInvoice; readonly label: string }) {
  return (
    <Button asChild size="sm" variant="secondary" leadingIcon={<FileDown />}>
      <a href={invoicePdfHref(invoice.id)} target="_blank" rel="noopener">
        {label}
      </a>
    </Button>
  );
}

function Issued({ invoice, onCancel }: { invoice: TaxInvoice; onCancel?: () => void }) {
  const t = useTranslations('finance.billing.invoice');
  const format = useFormatter();
  return (
    <div className="flex flex-col gap-4 px-5 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-[0.9375rem] text-ink">{invoice.number}</span>
          <span className="type-body-sm text-ink-faint">
            {t('issuedOn', {
              date: format.dateTime(day(invoice.invoiceDate), { dateStyle: 'medium' }),
            })}
            {invoice.replacesNumber && ` · ${t('replaces', { number: invoice.replacesNumber })}`}
          </span>
        </span>
        <StatusPill size="sm" tone="done" label={t('issued')} />
      </div>
      <InvoiceFigures figures={invoice} placeOfSupply={invoice.placeOfSupply} />
      <p className="type-body-sm text-ink-muted">
        {t('customerGstin')}: {invoice.customerGstin ?? t('unregistered')}
      </p>
      <ScheduleDifference figures={invoice} />
      <div className="flex flex-wrap gap-2">
        <PdfLink invoice={invoice} label={t('open')} />
        {onCancel && (
          <Button size="sm" variant="quiet" leadingIcon={<Ban />} onClick={onCancel}>
            {t('cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}

function Draft({
  billing,
  reissue,
  onIssue,
}: {
  billing: ProjectBilling;
  reissue: boolean;
  onIssue?: () => void;
}) {
  const t = useTranslations('finance.billing.invoice');
  const { draft } = billing;
  return (
    <div className="flex flex-col gap-4 px-5 pb-5">
      <div className="flex items-center justify-between gap-3">
        <span className="type-body-sm text-ink-muted">{t('preview')}</span>
        <StatusPill size="sm" tone="neutral" label={t('notYet')} />
      </div>
      {draft.blocker ? (
        <p className="rounded-md bg-sunken px-3 py-2.5 type-body-sm text-ink-muted">
          {t(`blocker.${draft.blocker}`)}
        </p>
      ) : (
        <>
          <InvoiceFigures figures={draft} placeOfSupply={draft.placeOfSupply} />
          {draft.linesWithoutCode > 0 && (
            <p className="type-body-sm text-ink-faint">
              {t('codesMissing', { count: draft.linesWithoutCode, total: draft.lineCount })}
            </p>
          )}
          <ScheduleDifference figures={draft} />
        </>
      )}
      {onIssue && !draft.blocker && (
        <div>
          <Button size="sm" variant="primary" leadingIcon={<FileText />} onClick={onIssue}>
            {reissue ? t('reissue') : t('issue')}
          </Button>
        </div>
      )}
    </div>
  );
}

function History({ invoices }: { readonly invoices: readonly TaxInvoice[] }) {
  const t = useTranslations('finance.billing.invoice');
  const format = useFormatter();
  if (invoices.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-hairline px-5 py-4">
      <p className="type-overline text-ink-faint uppercase">{t('history')}</p>
      <ul className="flex flex-col divide-y divide-hairline">
        {invoices.map((invoice) => (
          <li key={invoice.id} className="flex items-start justify-between gap-3 py-2">
            <span className="flex min-w-0 flex-col">
              <a
                href={invoicePdfHref(invoice.id)}
                target="_blank"
                rel="noopener"
                className="font-mono text-[0.8125rem] text-ink-muted line-through hover:text-accent"
              >
                {invoice.number}
              </a>
              <span className="type-body-sm text-ink-faint">
                {t('cancelledOn', {
                  date: invoice.cancelledAt
                    ? format.dateTime(new Date(invoice.cancelledAt), { dateStyle: 'medium' })
                    : '',
                  reason: invoice.cancelReason ?? '',
                })}
              </span>
            </span>
            <StatusPill size="sm" tone="neutral" label={t('cancelled')} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The project's GST tax invoice: preview, issue, open, cancel and re-issue. */
export function InvoiceCard({
  projectId,
  customerName,
}: {
  readonly projectId: string;
  readonly customerName: string;
}) {
  const t = useTranslations('finance.billing.invoice');
  const canIssue = useCan('finance.record_payments');
  const canView = useCan('finance.view') || canIssue;
  const query = useProjectBilling(projectId, canView);
  const [issuing, setIssuing] = useState(false);
  const [session, setSession] = useState(0);
  const [cancelling, setCancelling] = useState<TaxInvoice | null>(null);
  if (!canView) return null;
  const current = query.data?.invoices.find((invoice) => invoice.status === 'issued');
  const cancelled = query.data?.invoices.filter((invoice) => invoice.status === 'cancelled') ?? [];
  const issue = () => {
    setSession((value) => value + 1);
    setIssuing(true);
  };

  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      {query.isPending ? (
        <div className="px-5 pb-5">
          <ListSkeleton label={t('loading')} rows={3} />
        </div>
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} className="m-5" />
      ) : current ? (
        <Issued
          invoice={current}
          {...(canIssue ? { onCancel: () => setCancelling(current) } : {})}
        />
      ) : (
        <Draft
          billing={query.data}
          reissue={cancelled.length > 0}
          {...(canIssue ? { onIssue: issue } : {})}
        />
      )}
      <History invoices={cancelled} />
      {query.data && canIssue && (
        <IssueInvoiceDialog
          key={session}
          projectId={projectId}
          customerName={customerName}
          draft={query.data.draft}
          open={issuing}
          onClose={() => setIssuing(false)}
        />
      )}
      <CancelInvoiceDialog invoice={cancelling} onClose={() => setCancelling(null)} />
    </Card>
  );
}
