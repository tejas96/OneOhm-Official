import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { updatedAt } from './columns';
import { users } from './identity.schema';

/** Where a reseller's commission is paid: PAN plus a UPI ID or bank details. */
export const resellerPayoutDetails = pgTable('reseller_payout_details', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  bankAccountName: text('bank_account_name'),
  bankAccountNumber: text('bank_account_number'),
  bankIfsc: text('bank_ifsc'),
  upiId: text('upi_id'),
  pan: text('pan'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  updatedAt: updatedAt(),
});
