import { Inject, Injectable } from '@nestjs/common';
import type { CustomerActivity } from '@oneohm/api-contracts';
import { changeRequests, customers } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { changeRequestSummaries } from '../discom/change-request-read';
import {
  customerFeedbackList,
  customerReferrals,
  customerServiceRequests,
} from './customer-aftercare.read';
import { customerAlerts, customerChat, customerOutbound } from './customer-messages.read';
import { customerMoney } from './customer-money.read';

/**
 * The rest of the customer 360 (PRD 3.2), read-only: money per project, the WhatsApp
 * chat and messages sent, app alerts, change requests, service, feedback and referrals.
 */
@Injectable()
export class CustomerActivityService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(customerId: string): Promise<CustomerActivity> {
    const [customer] = await this.db
      .select({ id: customers.id, phone: customers.phoneE164 })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) throw notFound('That customer');
    const [money, chat, outbound, alerts, requests, serviceRequests, feedback, referrals] =
      await Promise.all([
        customerMoney(this.db, customer.id),
        customerChat(this.db, customer.phone),
        customerOutbound(this.db, customer.id, customer.phone),
        customerAlerts(this.db, customer.id),
        changeRequestSummaries(this.db, eq(changeRequests.customerId, customer.id)),
        customerServiceRequests(this.db, customer.id),
        customerFeedbackList(this.db, customer.id),
        customerReferrals(this.db, customer.id),
      ]);
    return {
      projects: money.projects,
      payments: money.payments,
      chat,
      outbound,
      alerts,
      changeRequests: requests,
      serviceRequests,
      feedback,
      referrals,
    };
  }
}
