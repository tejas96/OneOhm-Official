import { Inject, Injectable } from '@nestjs/common';
import type { LeadCampaignRecord } from '@oneohm/api-contracts';
import { leadCampaigns, leads } from '@oneohm/database';
import { asc, count, eq, isNotNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

/** The owner's ad and campaign codes, edited in Settings → Selling → Ad and campaign codes. */
@Injectable()
export class LeadCampaignsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<LeadCampaignRecord[]> {
    const campaigns = await this.db.select().from(leadCampaigns).orderBy(asc(leadCampaigns.code));
    const used = await this.db
      .select({ code: leads.campaignCode, total: count() })
      .from(leads)
      .where(isNotNull(leads.campaignCode))
      .groupBy(leads.campaignCode);
    const totals = new Map(used.map((row) => [row.code, row.total]));
    return campaigns.map((campaign) => ({
      code: campaign.code,
      name: campaign.name,
      active: campaign.active,
      leads: totals.get(campaign.code) ?? 0,
    }));
  }

  async create(actor: Actor, input: { code: string; name: string }): Promise<LeadCampaignRecord[]> {
    assertCan(actor, 'settings.manage');
    const inserted = await this.db
      .insert(leadCampaigns)
      .values({ code: input.code, name: input.name.trim() })
      .onConflictDoNothing()
      .returning({ code: leadCampaigns.code });
    if (inserted.length === 0) throw conflict('This code is already in the list.', 'exists');
    await recordAudit(
      this.db,
      actor.userId,
      'lead_campaign.created',
      'lead_campaign',
      input.code,
      input,
    );
    return this.list();
  }

  async update(
    actor: Actor,
    code: string,
    patch: { name?: string | undefined; active?: boolean | undefined },
  ): Promise<LeadCampaignRecord[]> {
    assertCan(actor, 'settings.manage');
    const [existing] = await this.db
      .select({ code: leadCampaigns.code })
      .from(leadCampaigns)
      .where(eq(leadCampaigns.code, code));
    if (!existing) throw notFound('That code');
    await this.db.transaction(async (tx) => {
      await tx
        .update(leadCampaigns)
        .set({
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
          updatedAt: new Date(),
        })
        .where(eq(leadCampaigns.code, code));
      await recordAudit(tx, actor.userId, 'lead_campaign.updated', 'lead_campaign', code, patch);
    });
    return this.list();
  }
}
