'use client';

import type { CustomerActivity } from '@oneohm/api-contracts';
import { RecordChat } from '@/features/service/whatsapp/record-chat';
import { CustomerLeadHistory } from './customer-lead-history';
import { CustomerAlerts, CustomerOutbound } from './customer-outbound';

/**
 * Every conversation with the customer: the WhatsApp chat, the calls, visits and notes
 * from their leads, messages sent and app alerts.
 */
export function CustomerConversationsTab({
  activity,
  customerId,
  name,
  phone,
}: {
  readonly activity: CustomerActivity;
  readonly customerId: string;
  readonly name: string;
  readonly phone: string;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      {/* The chat with its reply box: answer the customer right here. */}
      <RecordChat phone={phone} name={name} customerId={customerId} />
      <div className="flex min-w-0 flex-col gap-6">
        <CustomerLeadHistory entries={activity.leadHistory} />
        <CustomerOutbound messages={activity.outbound} />
        <CustomerAlerts alerts={activity.alerts} />
      </div>
    </div>
  );
}
