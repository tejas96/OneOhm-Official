import { messageTemplates } from '@oneohm/database';
import { MARKETING_MESSAGE_TEMPLATES } from '@oneohm/domain';
import { type TemplateApproval, whatsAppTemplateStatuses } from '@oneohm/marketing';
import { and, eq } from 'drizzle-orm';
import type { MarketingDeps } from './deps';
import { mergeJobData } from './job-store';

export interface TemplateStatus {
  readonly name: string;
  readonly status: TemplateApproval;
  readonly hasImage: boolean;
  readonly reason: string | null;
}

/** One answer per template: approved in any language wins; a photo version counts when approved. */
export function foldStatuses(rows: readonly TemplateStatus[]): Map<string, TemplateStatus> {
  const folded = new Map<string, TemplateStatus>();
  const rank: Record<TemplateApproval, number> = {
    approved: 3,
    pending: 2,
    rejected: 1,
    not_sent: 0,
  };
  for (const row of rows) {
    const old = folded.get(row.name);
    if (!old || rank[row.status] > rank[old.status]) folded.set(row.name, row);
    else if (row.status === 'approved' && old.status === 'approved' && row.hasImage)
      folded.set(row.name, row);
  }
  return folded;
}

/** Switches on each marketing message once Meta approves it (the photo version when approved). */
export async function checkTemplateApproval(deps: MarketingDeps): Promise<number | null> {
  const { db, config, whatsapp } = deps;
  if (config.mode === 'sandbox' || !whatsapp) return null;
  const keys = MARKETING_MESSAGE_TEMPLATES.map((template) => template.key);
  const rows = await whatsAppTemplateStatuses(
    {
      token: whatsapp.token,
      wabaId: whatsapp.businessAccountId,
      graphVersion: whatsapp.apiVersion,
      appId: config.meta?.appId ?? null,
      fetch: config.fetch,
    },
    keys,
  );
  const found = foldStatuses(rows);
  let switched = 0;
  const report: Record<string, { status: string; reason: string | null }> = {};
  for (const [key, row] of found) {
    report[key] = { status: row.status, reason: row.status === 'rejected' ? row.reason : null };
    if (row.status !== 'approved') continue;
    const [saved] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, key));
    if (!saved || (saved.active && (!row.hasImage || saved.extrasApproved))) continue;
    await db
      .update(messageTemplates)
      .set({
        active: true,
        ...(row.hasImage ? { extrasApproved: true } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(messageTemplates.key, key)));
    switched += 1;
  }
  await mergeJobData(db, 'templates', report);
  return switched;
}
