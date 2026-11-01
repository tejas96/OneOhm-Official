import { Inject, Injectable } from '@nestjs/common';
import type { ReportKey, ReportSetting } from '@oneohm/api-contracts';
import { reportSettings } from '@oneohm/database';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { REPORT_DEFINITIONS } from './report-definitions';

/**
 * Which statutory reports a customer sees in their app (PRD 3.18). Each report has a
 * built-in default; the owner can switch any of them in Settings.
 */
@Injectable()
export class ReportSettingsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<ReportSetting[]> {
    const rows = await this.db.select().from(reportSettings);
    const chosen = new Map(rows.map((row) => [row.key, row.customerVisible]));
    return REPORT_DEFINITIONS.map((definition) => ({
      key: definition.key,
      name: definition.name,
      defaultVisible: definition.customerVisible,
      customerVisible: chosen.get(definition.key) ?? definition.customerVisible,
    }));
  }

  /** The reports a customer may open once they are ready. */
  async customerVisible(): Promise<ReadonlySet<string>> {
    const settings = await this.list();
    return new Set(
      settings.filter((setting) => setting.customerVisible).map((setting) => setting.key),
    );
  }

  async update(actor: Actor, key: ReportKey, customerVisible: boolean): Promise<ReportSetting> {
    assertCan(actor, 'settings.manage');
    if (!REPORT_DEFINITIONS.some((definition) => definition.key === key)) {
      throw notFound('That report');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .insert(reportSettings)
        .values({ key, customerVisible, updatedByUserId: actor.userId })
        .onConflictDoUpdate({
          target: reportSettings.key,
          set: { customerVisible, updatedByUserId: actor.userId, updatedAt: new Date() },
        });
      await recordAudit(tx, actor.userId, 'report_setting.changed', 'report_setting', key, {
        customerVisible,
      });
    });
    const updated = (await this.list()).find((setting) => setting.key === key);
    if (!updated) throw notFound('That report');
    return updated;
  }
}
