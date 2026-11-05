'use client';

import type { Customer, CustomerAccount } from '@oneohm/api-contracts';
import { Avatar, Badge, Button } from '@oneohm/design-system/web';
import { ArrowLeft, Link2, Mail, PencilLine, Phone } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { SendToCustomerButton } from '@/features/send-to-customer/send-to-customer-button';
import { OpenChatButton } from '@/features/service/whatsapp/open-chat-button';
import { formatPhone, swatchFor } from '@/lib/format/contact';
import { useCan } from '@/providers/current-user';
import { EditCustomerSheet } from './edit-customer-sheet';

/** Who the customer is, how to reach them, other accounts on their number, and editing. */
export function CustomerHeader({
  customer,
  accounts,
  children,
}: {
  readonly customer: Customer;
  readonly accounts: readonly CustomerAccount[];
  /** The figures row under the name. */
  readonly children: ReactNode;
}) {
  const t = useTranslations('customers');
  const format = useFormatter();
  const canEdit = useCan('customers.manage');
  const [editing, setEditing] = useState(false);
  return (
    <header className="flex flex-col gap-5">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 self-start type-body-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={customer.name} swatch={swatchFor(customer.id)} size="lg" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="soft">{t(`kind.${customer.kind}`)}</Badge>
              <span className="font-mono text-[0.75rem] text-ink-faint uppercase">
                {t('since', {
                  date: format.dateTime(new Date(customer.createdAt), {
                    month: 'short',
                    year: 'numeric',
                  }),
                })}
              </span>
            </div>
            <h1 className="type-display-lg text-balance text-ink md:type-display-xl">
              {customer.name}
            </h1>
            <p className="flex flex-wrap gap-x-3 type-body text-ink-muted">
              <span className="font-mono">{formatPhone(customer.phone)}</span>
              {customer.email && (
                <>
                  <span aria-hidden>·</span>
                  <span className="break-all">{customer.email}</span>
                </>
              )}
              {customer.gstin && (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{t('gstinLine', { gstin: customer.gstin })}</span>
                </>
              )}
            </p>
            <AccountBadges accounts={accounts} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm" leadingIcon={<Phone />}>
            <a href={`tel:${customer.phone}`}>{t('call')}</a>
          </Button>
          <OpenChatButton phone={customer.phone} label={t('whatsapp')} />
          <SendToCustomerButton scope={{ customerId: customer.id }} />
          {customer.email && (
            <Button asChild variant="secondary" size="sm" leadingIcon={<Mail />}>
              <a href={`mailto:${customer.email}`}>{t('email')}</a>
            </Button>
          )}
          {canEdit && (
            <Button
              variant="quiet"
              size="sm"
              leadingIcon={<PencilLine />}
              onClick={() => setEditing(true)}
            >
              {t('editCustomer')}
            </Button>
          )}
        </div>
      </div>
      {children}
      {canEdit && (
        <EditCustomerSheet customer={customer} open={editing} onOpenChange={setEditing} />
      )}
    </header>
  );
}

/** The same phone on a staff, reseller, crew, contractor or vendor account; never merged. */
function AccountBadges({ accounts }: { readonly accounts: readonly CustomerAccount[] }) {
  const t = useTranslations('customers.accounts');
  if (accounts.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" title={t('hint')} aria-label={t('hint')}>
      {accounts.map((account) => (
        <li key={account.kind}>
          <Badge variant="accent" className="gap-1">
            <Link2 aria-hidden className="size-3" />
            {t(account.kind, { name: account.name })}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
