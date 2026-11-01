import {
  EPC_STAGES,
  LEAD_SOURCES,
  LEAD_STAGES,
  LINE_CATEGORIES,
  PROJECT_TYPES,
  ROLE_KINDS,
  SUBSIDY_CATEGORIES,
  WAITING_PARTIES,
} from '@oneohm/domain';
import { pgEnum } from 'drizzle-orm/pg-core';

export const roleKindEnum = pgEnum('role_kind', ROLE_KINDS);
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive']);
export const sessionClientEnum = pgEnum('session_client', ['web', 'mobile']);
export const customerKindEnum = pgEnum('customer_kind', ['individual', 'organization']);
export const subsidyCategoryEnum = pgEnum('subsidy_category', SUBSIDY_CATEGORIES);
export const phaseEnum = pgEnum('electric_phase', ['single', 'three']);
export const leadStageEnum = pgEnum('lead_stage', LEAD_STAGES);
export const leadSourceEnum = pgEnum('lead_source', LEAD_SOURCES);
export const leadActivityKindEnum = pgEnum('lead_activity_kind', [
  'note',
  'call',
  'visit',
  'whatsapp',
  'stage_change',
  'follow_up',
]);
export const productCategoryEnum = pgEnum('product_category', LINE_CATEGORIES);
export const quotationStatusEnum = pgEnum('quotation_status', [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'superseded',
]);
export const systemTypeEnum = pgEnum('system_type', ['on_grid', 'hybrid', 'off_grid']);
export const structureTypeEnum = pgEnum('structure_type', [
  'rcc_elevated',
  'tin_shed',
  'ground_mount',
]);
export const quantityBasisEnum = pgEnum('quantity_basis', ['catalog', 'default', 'survey']);
export const projectTypeEnum = pgEnum('project_type', PROJECT_TYPES);
export const projectStatusEnum = pgEnum('project_status', [
  'active',
  'operational',
  'completed',
  'cancelled',
]);
export const epcStageEnum = pgEnum('epc_stage', EPC_STAGES);
export const waitingPartyEnum = pgEnum('waiting_party', WAITING_PARTIES);
export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'ready',
  'in_progress',
  'waiting',
  'in_review',
  'completed',
]);
export const payerEnum = pgEnum('payer', ['customer', 'bank']);
export const milestoneStatusEnum = pgEnum('milestone_status', [
  'upcoming',
  'due',
  'partly_paid',
  'paid',
]);
export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'cheque',
  'bank_transfer',
  'upi',
  'razorpay',
  'bank_disbursement',
]);
export const payablePartyEnum = pgEnum('payable_party', ['vendor', 'contractor']);
export const payableStatusEnum = pgEnum('payable_status', ['pending', 'approved', 'paid']);
export const documentSourceEnum = pgEnum('document_source', ['upload', 'system', 'report']);
export const outboxChannelEnum = pgEnum('outbox_channel', ['whatsapp', 'sms', 'push']);
export const outboxStatusEnum = pgEnum('outbox_status', ['pending', 'sent', 'failed', 'skipped']);
