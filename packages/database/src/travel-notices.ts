import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { notify } from './notify';
import { readableDay } from './readable-day';
import { travelClaims } from './schema/site-activity.schema';

/**
 * Tells the worker their travel money has been paid: "₹420 travel for 9 Nov 2026 paid".
 * Called when a bill becomes paid, by hand or by bank transfer; only a bill that came from
 * a travel claim says anything. It opens the worker's Travel screen. One alert per claim.
 */
export async function tellTravelPaid(db: DatabaseExecutor, payableId: string): Promise<boolean> {
  const [claim] = await db
    .select({
      id: travelClaims.id,
      userId: travelClaims.userId,
      workDate: travelClaims.workDate,
      amountPaise: travelClaims.amountPaise,
      projectId: travelClaims.projectId,
    })
    .from(travelClaims)
    .where(eq(travelClaims.payableId, payableId))
    .limit(1);
  if (!claim) return false;
  await notify(
    db,
    { userId: claim.userId },
    {
      kind: 'travel_claim_paid',
      title: `${formatInr(claim.amountPaise)} travel for ${readableDay(claim.workDate)} paid`,
      body: 'It has been paid out. Check your account.',
      subject: { type: 'travel_claim', id: claim.id },
      dedupeKey: `travel_claim_paid:${claim.id}`,
    },
  );
  return true;
}
