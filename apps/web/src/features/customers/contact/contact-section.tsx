'use client';

import { Button, SegmentedControl } from '@oneohm/design-system/web';
import { CONTACT_CHANNELS, type ContactChannel } from '@oneohm/domain';
import { MessageCircleWarning, RotateCcw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';
import { HandoverList } from './handover-list';
import { useCustomerContact, useHandovers, useSetContact } from './use-contact';

/**
 * How OneOhm reaches this customer: WhatsApp first, SMS when they are not on WhatsApp,
 * in person when neither works; and what is waiting to be shared in person.
 */
export function ContactSection({ customerId }: { readonly customerId: string }) {
  const t = useTranslations('customers.contact');
  const format = useFormatter();
  const canManage = useCan('customers.manage');
  const contact = useCustomerContact(customerId);
  const set = useSetContact(customerId);
  const handovers = useHandovers(customerId);
  const data = contact.data;
  if (!data) return null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl type-body-sm text-ink-muted">{t(`about.${data.route}`)}</p>
        {canManage ? (
          <SegmentedControl<ContactChannel>
            label={t('label')}
            size="sm"
            value={data.channel}
            onValueChange={(channel) => !set.isPending && set.mutate({ channel })}
            options={CONTACT_CHANNELS.map((value) => ({ value, label: t(`channel.${value}`) }))}
          />
        ) : (
          <span className="type-body-sm font-medium text-ink">{t(`channel.${data.channel}`)}</span>
        )}
      </div>
      {data.whatsappUnreachableAt && (
        <div className="flex flex-col gap-3 rounded-xl bg-at-risk-tint px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2 type-body-sm text-ink">
            <MessageCircleWarning aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
            {t('unreachable', {
              date: format.dateTime(new Date(data.whatsappUnreachableAt), {
                day: 'numeric',
                month: 'short',
              }),
            })}
          </span>
          {canManage && (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<RotateCcw />}
              pending={set.isPending}
              onClick={() => set.mutate({ tryWhatsAppAgain: true })}
            >
              {t('tryAgain')}
            </Button>
          )}
        </div>
      )}
      {handovers.data && handovers.data.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="type-overline text-ink-faint uppercase">{t('toShare')}</h3>
          <HandoverList items={handovers.data} showCustomer={false} />
        </div>
      )}
    </div>
  );
}
