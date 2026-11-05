import { Inject, Injectable } from '@nestjs/common';
import type {
  ApprovalPolicyView,
  LeadAssignmentRulesRecord,
  OnboardingSettingsRecord,
} from '@oneohm/api-contracts';
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
  cleanCityOwners,
  isAssignmentRules,
  isLeadAssignmentRules,
  type LeadAssignmentRules,
  onboardingFieldErrors,
  onboardingProblem,
  type SettingErrors,
} from '@oneohm/domain';
import { desc, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { invalid } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CatalogService } from '../catalog/catalog.service';
import { cityOwnerStanding } from '../crm/lead-owner';

const CHECKS: {
  readonly [K in BusinessSettingKey]: (value: BusinessSettingsMap[K]) => SettingErrors;
} = {
  reminders: checkReminderTiming,
  assignment: (value) => (isAssignmentRules(value) ? {} : { strategy: 'Pick a way to assign.' }),
  approvals: checkApprovalPolicy,
  dashboard: checkDashboardSettings,
  lead_assignment: (value) =>
    isLeadAssignmentRules(value) ? {} : { strategy: 'Pick how new leads are given out.' },
  onboarding: (value) => {
    const problem = onboardingProblem(value);
    // Field paths (`billBands.2.maxRupees`) mark the inputs; `onboarding` is the summary.
    return problem ? { ...onboardingFieldErrors(value), onboarding: problem } : {};
  },
};

const PROBLEM: Readonly<Record<BusinessSettingKey, string>> = {
  reminders: 'Check the reminder times.',
  assignment: 'Check the assignment rules.',
  approvals: 'Check the approval limits.',
  dashboard: 'Check the dashboard numbers.',
  lead_assignment: 'Check the lead rule.',
  onboarding: 'Check the onboarding settings.',
};

const copyLeadRules = (rules: LeadAssignmentRules): LeadAssignmentRulesRecord => ({
  strategy: rules.strategy,
  cityOwners: rules.cityOwners.map((owner) => ({
    userId: owner.userId,
    cities: [...owner.cities],
  })),
});

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
    private readonly catalog: CatalogService,
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
    // Onboarding names the limit it breaks (say "At most 8 bill bands."), not just the area.
    if (Object.keys(errors).length > 0) throw invalid(errors.onboarding ?? PROBLEM[key], errors);
    const before = await this.get(key);
    // The self-survey discount is money off a customer's payment: finance (or the project owner) changes it.
    if (key === 'reminders') {
      const was = before as BusinessSettingsMap['reminders'];
      const now = value as BusinessSettingsMap['reminders'];
      if (
        was.selfSurveyOffer !== now.selfSurveyOffer ||
        was.selfSurveyPaise !== now.selfSurveyPaise
      )
        assertCan(actor, 'finance.record_payments', 'projects.manage');
    }
    await this.db.transaction(async (tx) => {
      await writeBusinessSetting(tx, key, value, actor.userId);
      await recordAudit(tx, actor.userId, `settings.${key}_changed`, 'settings', key, {
        before,
        after: value,
      });
    });
    return this.get(key);
  }

  /**
   * The lead rule as the screen shows it (plain lists, so it can be edited), with each
   * city owner's name and whether they still work on leads.
   */
  async leadAssignment(): Promise<LeadAssignmentRulesRecord> {
    const rules = copyLeadRules(await this.get('lead_assignment'));
    const ids = rules.cityOwners.map((owner) => owner.userId);
    const { canOwn, names } = await cityOwnerStanding(this.db, ids);
    return {
      ...rules,
      cityOwners: rules.cityOwners.map((owner) => ({
        ...owner,
        ...(names.has(owner.userId) ? { name: names.get(owner.userId) } : {}),
        inactive: !canOwn.has(owner.userId),
      })),
    };
  }

  /**
   * Saves the lead rule (`cleanCityOwners`). A saved owner who no longer works on leads
   * is dropped (the screen marks them inactive); a new one who cannot, or anyone left
   * with no city, is refused with a message by that person.
   */
  async saveLeadAssignment(
    actor: Actor,
    rules: LeadAssignmentRulesRecord,
  ): Promise<LeadAssignmentRulesRecord> {
    const saved = new Set((await this.get('lead_assignment')).cityOwners.map((o) => o.userId));
    const ids = rules.cityOwners.map((owner) => owner.userId);
    const { canOwn } = await cityOwnerStanding(this.db, ids);
    const cleaned = cleanCityOwners(rules.cityOwners, canOwn, saved);
    const errors: SettingErrors = {};
    for (const id of cleaned.blank) errors[`cities_${id}`] = 'Add at least one city, or remove.';
    for (const id of cleaned.refused)
      errors[`cities_${id}`] = 'This person cannot work on leads. Pick someone in Sales.';
    if (cleaned.refused.length > 0) throw invalid('Pick someone who works on leads.', errors);
    if (cleaned.blank.length > 0)
      throw invalid('Add a city for each person, or remove them.', errors);
    await this.save(actor, 'lead_assignment', {
      strategy: rules.strategy,
      cityOwners: cleaned.kept,
    });
    return this.leadAssignment();
  }

  /** The WhatsApp onboarding settings as the screen shows them. */
  async onboarding(): Promise<OnboardingSettingsRecord> {
    const saved = await this.get('onboarding');
    return {
      ...saved,
      serviceCities: [...saved.serviceCities],
      billBands: saved.billBands.map((band) => ({ ...band })),
      panelProductIds: { ...saved.panelProductIds },
    };
  }

  /**
   * Saves the onboarding settings. City names are trimmed with blanks and repeats
   * dropped, blank band translations are left out, and a panel override must be an
   * active panel from the catalog.
   */
  async saveOnboarding(
    actor: Actor,
    settings: OnboardingSettingsRecord,
  ): Promise<OnboardingSettingsRecord> {
    const serviceCities = [...new Set(settings.serviceCities.map((c) => c.trim()).filter(Boolean))];
    const panels = new Set((await this.catalog.products('panel')).map((panel) => panel.id));
    const errors: SettingErrors = {};
    const panelProductIds: { individual?: string; commercial?: string } = {};
    for (const type of ['individual', 'commercial'] as const) {
      const id = settings.panelProductIds[type];
      if (id === undefined) continue;
      if (!panels.has(id)) errors[`panel_${type}`] = 'Pick an active panel from the catalog.';
      panelProductIds[type] = id;
    }
    if (Object.keys(errors).length > 0) throw invalid('Check the panels you picked.', errors);
    // A blank Marathi or Hindi label means "use the label".
    const billBands = settings.billBands.map(({ maxRupees, labelMr, labelHi, ...band }) => ({
      ...band,
      ...(maxRupees === undefined ? {} : { maxRupees }),
      ...(labelMr?.trim() ? { labelMr: labelMr.trim() } : {}),
      ...(labelHi?.trim() ? { labelHi: labelHi.trim() } : {}),
    }));
    await this.save(actor, 'onboarding', {
      ...settings,
      serviceCities,
      billBands,
      panelProductIds,
    });
    return this.onboarding();
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
