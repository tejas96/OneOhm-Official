import { Inject, Injectable } from '@nestjs/common';
import type { ApprovalPolicyView } from '@oneohm/api-contracts';
import {
  type BusinessSettingKey,
  type BusinessSettingsMap,
  rateCards,
  readBusinessSetting,
  writeBusinessSetting,
} from '@oneohm/database';
import {
  checkApprovalPolicy,
  checkDashboardSettings,
  checkReminderTiming,
  isAssignmentRules,
  isLeadAssignmentRules,
  type SettingErrors,
} from '@oneohm/domain';
import { desc, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';

const CHECKS: {
  readonly [K in BusinessSettingKey]: (value: BusinessSettingsMap[K]) => SettingErrors;
} = {
  reminders: checkReminderTiming,
  assignment: (value) => (isAssignmentRules(value) ? {} : { strategy: 'Pick a way to assign.' }),
  approvals: checkApprovalPolicy,
  dashboard: checkDashboardSettings,
  lead_assignment: (value) =>
    isLeadAssignmentRules(value) ? {} : { strategy: 'Pick how new leads are given out.' },
};

const PROBLEM: Readonly<Record<BusinessSettingKey, string>> = {
  reminders: 'Check the reminder times.',
  assignment: 'Check the assignment rules.',
  approvals: 'Check the approval limits.',
  dashboard: 'Check the dashboard numbers.',
  lead_assignment: 'Check the lead rule.',
};

/**
 * Business rules owners change in Settings without a developer (PRD 7.2): reminder
 * timing, assignment rules, approval limits and dashboard thresholds. Every save is
 * checked and audited; the worker and the API read them on their next run.
 */
@Injectable()
export class BusinessSettingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  get<K extends BusinessSettingKey>(key: K): Promise<BusinessSettingsMap[K]> {
    return readBusinessSetting(this.db, key);
  }

  async save<K extends BusinessSettingKey>(
    actor: Actor,
    key: K,
    value: BusinessSettingsMap[K],
  ): Promise<BusinessSettingsMap[K]> {
    const errors = CHECKS[key](value);
    if (Object.keys(errors).length > 0) throw invalid(PROBLEM[key], errors);
    const before = await this.get(key);
    await this.db.transaction(async (tx) => {
      await writeBusinessSetting(tx, key, value, actor.userId);
      await recordAudit(tx, actor.userId, `settings.${key}_changed`, 'settings', key, {
        before,
        after: value,
      });
    });
    return this.get(key);
  }

  /** The approval limits with the discount limit from the rate card, on one screen. */
  async approvals(): Promise<ApprovalPolicyView> {
    const policy = await this.get('approvals');
    const [card] = await this.db
      .select({ bp: sql<number | null>`(${rateCards.rates}->>'discountApprovalBp')::int` })
      .from(rateCards)
      .orderBy(desc(rateCards.updatedAt))
      .limit(1);
    return { ...policy, discountLimitBp: card?.bp ?? this.env.DISCOUNT_APPROVAL_BP };
  }
}
