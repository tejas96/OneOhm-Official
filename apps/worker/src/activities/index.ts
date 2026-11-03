import type { Database } from '@oneohm/database';
import type { PushSender } from '../channels/expo-push';
import type { SmsSender } from '../channels/sms';
import type { WhatsAppSender } from '../channels/whatsapp-cloud';
import { dailyActivities } from './daily.activities';
import { deliveryActivities } from './delivery.activities';
import type { PayLinkSettings } from './payment-reminders';

export interface ActivityDeps {
  readonly db: Database;
  readonly sender: WhatsAppSender;
  readonly push: PushSender;
  readonly sms: SmsSender;
  readonly language: string;
  readonly timeZone: string;
  readonly payLinks: PayLinkSettings;
}

export function createActivities(deps: ActivityDeps) {
  return { ...deliveryActivities(deps), ...dailyActivities(deps.db, deps.timeZone, deps.payLinks) };
}

export type Activities = ReturnType<typeof createActivities>;
