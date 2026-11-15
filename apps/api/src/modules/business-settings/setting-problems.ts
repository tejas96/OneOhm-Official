import type { BusinessSettingKey } from '@oneohm/database';

/** The summary line when a Settings area does not save. */
export const PROBLEM: Readonly<Record<BusinessSettingKey, string>> = {
  reminders: 'Check the reminder times.',
  assignment: 'Check the assignment rules.',
  approvals: 'Check the approval limits.',
  payments: 'Check the RazorpayX fee.',
  dashboard: 'Check the dashboard numbers.',
  lead_assignment: 'Check the lead rule.',
  onboarding: 'Check the onboarding settings.',
  visits: 'Check the visit settings.',
  marketing: 'Check the marketing settings.',
};
