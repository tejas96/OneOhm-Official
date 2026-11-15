import { readBusinessSetting } from '@oneohm/database';
import { saveConnection } from '@oneohm/marketing';
import { alertMarketing, connectionsSubject, providerName, rupees } from './alerts';
import type { MarketingDeps } from './deps';
import { forEachPlatform } from './providers';

/** Prepaid money is low: under the line the owner set, nothing left included. */
export const isLowBalance = (balancePaise: number | null, lowPaise: number): boolean =>
  balancePaise !== null && balancePaise < lowPaise;

/** Reads each platform's ad balance, keeps it, and tells the owner once a day when it is low. */
export async function checkBalances(deps: MarketingDeps, now: Date, today: string) {
  const { db, config, timeZone } = deps;
  const pace = { key: 'balance', cadence: 'hourly', timeZone, now } as const;
  const settings = await readBusinessSetting(db, 'marketing');
  return forEachPlatform(
    db,
    config,
    async (platform, provider) => {
      const balance = await platform.balance();
      if (!balance) return 0;
      await saveConnection(db, config.secretKey, provider, {
        balancePaise: balance.balancePaise,
        balanceCheckedAt: now,
        lastError: balance.problem,
      });
      if (isLowBalance(balance.balancePaise, settings.lowBalancePaise)) {
        const name = providerName(provider);
        await alertMarketing(db, {
          kind: 'marketing_low_balance',
          title: `Ad money is running low on ${name}`,
          body: `Ad money is running low on ${name}: ${rupees(balance.balancePaise ?? 0)} left. Add money so your ads keep running.`,
          dedupeKey: `mkt_low_balance:${provider}:${today}`,
          subject: connectionsSubject(),
        });
      }
      return 1;
    },
    pace,
  );
}
