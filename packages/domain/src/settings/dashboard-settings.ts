import { checkWhole, type SettingErrors } from './settings-check';

/** What the command centre treats as late or soon, and how long its lists are (PRD 3.1, 7.2). */
export interface DashboardSettings {
  /** Days late before a task shows in "What could slip". */
  readonly riskLateDays: number;
  /** The "this week" window: deadlines, installs and bills due, and unowned work. */
  readonly dueSoonDays: number;
  /** Days past due before a customer payment needs a reminder call. */
  readonly paymentLateDays: number;
  /** Days waiting on the DISCOM before someone should call them. */
  readonly discomWaitDays: number;
  /** Days ahead to check that material is in hand for installs. */
  readonly materialLookAheadDays: number;
  /** How many items each list shows. */
  readonly actionsShown: number;
  readonly risksShown: number;
  readonly deadlinesShown: number;
}

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  riskLateDays: 1,
  dueSoonDays: 7,
  paymentLateDays: 7,
  discomWaitDays: 5,
  materialLookAheadDays: 14,
  actionsShown: 6,
  risksShown: 6,
  deadlinesShown: 12,
};

export function checkDashboardSettings(settings: DashboardSettings): SettingErrors {
  const errors: SettingErrors = {};
  checkWhole(errors, 'riskLateDays', settings.riskLateDays, 1, 60);
  checkWhole(errors, 'dueSoonDays', settings.dueSoonDays, 1, 31);
  checkWhole(errors, 'paymentLateDays', settings.paymentLateDays, 0, 90);
  checkWhole(errors, 'discomWaitDays', settings.discomWaitDays, 1, 90);
  checkWhole(errors, 'materialLookAheadDays', settings.materialLookAheadDays, 1, 60);
  checkWhole(errors, 'actionsShown', settings.actionsShown, 3, 20, 'items');
  checkWhole(errors, 'risksShown', settings.risksShown, 3, 20, 'items');
  checkWhole(errors, 'deadlinesShown', settings.deadlinesShown, 3, 40, 'items');
  return errors;
}
