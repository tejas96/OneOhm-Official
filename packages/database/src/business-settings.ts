import {
  type ApprovalPolicy,
  type AssignmentRules,
  type DashboardSettings,
  DEFAULT_APPROVAL_POLICY,
  DEFAULT_ASSIGNMENT_RULES,
  DEFAULT_DASHBOARD_SETTINGS,
  DEFAULT_LEAD_ASSIGNMENT,
  DEFAULT_ONBOARDING,
  DEFAULT_PAYMENT_SETTINGS,
  DEFAULT_REMINDER_TIMING,
  type LeadAssignmentRules,
  type OnboardingSettings,
  type PaymentSettings,
  type ReminderTiming,
  withDefaults,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { businessSettings } from './schema/automation.schema';

/** Each Settings area with its shape (PRD 7.2). */
export interface BusinessSettingsMap {
  readonly reminders: ReminderTiming;
  readonly assignment: AssignmentRules;
  readonly approvals: ApprovalPolicy;
  readonly dashboard: DashboardSettings;
  readonly lead_assignment: LeadAssignmentRules;
  readonly onboarding: OnboardingSettings;
  readonly payments: PaymentSettings;
}
export type BusinessSettingKey = keyof BusinessSettingsMap;

export const BUSINESS_SETTING_DEFAULTS: {
  readonly [K in BusinessSettingKey]: BusinessSettingsMap[K];
} = {
  reminders: DEFAULT_REMINDER_TIMING,
  assignment: DEFAULT_ASSIGNMENT_RULES,
  approvals: DEFAULT_APPROVAL_POLICY,
  dashboard: DEFAULT_DASHBOARD_SETTINGS,
  lead_assignment: DEFAULT_LEAD_ASSIGNMENT,
  onboarding: DEFAULT_ONBOARDING,
  payments: DEFAULT_PAYMENT_SETTINGS,
};

/** The saved values for one area over the shipped ones; never throws for a missing row. */
export async function readBusinessSetting<K extends BusinessSettingKey>(
  db: DatabaseExecutor,
  key: K,
): Promise<BusinessSettingsMap[K]> {
  const [row] = await db
    .select({ value: businessSettings.value })
    .from(businessSettings)
    .where(eq(businessSettings.key, key));
  return withDefaults(BUSINESS_SETTING_DEFAULTS[key], row?.value);
}

/** Saves one area (already checked by the caller). */
export async function writeBusinessSetting<K extends BusinessSettingKey>(
  db: DatabaseExecutor,
  key: K,
  value: BusinessSettingsMap[K],
  userId: string,
): Promise<void> {
  const values = { value, updatedByUserId: userId, updatedAt: new Date() };
  await db
    .insert(businessSettings)
    .values({ key, ...values })
    .onConflictDoUpdate({ target: businessSettings.key, set: values });
}
