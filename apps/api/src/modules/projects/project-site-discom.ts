import { type DatabaseExecutor, properties } from '@oneohm/database';
import { and, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';

/**
 * The DISCOM chosen for a new project is the site's DISCOM when the site has none yet (a site made
 * with "DISCOM unknown" in the new-site form). A site that already has a DISCOM keeps it: it was
 * typed or confirmed on purpose, and the change-request desk reads the site's own first. Returns
 * true when the site was filled in.
 */
export async function fillSiteDiscom(
  tx: DatabaseExecutor,
  actorId: string | null,
  site: { readonly id: string; readonly discomId: string | null },
  discomId: string,
  projectId: string,
): Promise<boolean> {
  if (site.discomId) return false;
  const filled = await tx
    .update(properties)
    .set({ discomId, updatedAt: new Date() })
    .where(and(eq(properties.id, site.id), isNull(properties.discomId)))
    .returning({ id: properties.id });
  if (filled.length === 0) return false;
  await recordAudit(tx, actorId, 'property.discom_set', 'property', site.id, {
    discomId,
    projectId,
  });
  return true;
}
