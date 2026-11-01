import type { Referral } from '@oneohm/api-contracts';
import { formatInr, StatusPill, Text, type Tone, unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { REFER } from '@/copy/care';
import { momentDate, shortDate } from '@/lib/dates';

const TONE: Readonly<Record<Referral['status'], Tone>> = {
  received: 'waiting',
  in_progress: 'onTrack',
  ordered: 'onTrack',
  installed: 'done',
  closed: 'neutral',
};

type Reward = NonNullable<Referral['reward']>;
const REWARD_TONE: Readonly<Record<Reward['status'], Tone>> = {
  pending: 'review',
  approved: 'onTrack',
  paid: 'done',
  rejected: 'neutral',
};

function RewardLine({ reward }: { readonly reward: Reward }) {
  const amount = formatInr(reward.amountPaise);
  return (
    <View style={styles.reward}>
      <Text variant="label" tone="secondary">
        {reward.status === 'paid' && reward.paidOn
          ? REFER.rewardPaidOn(amount, shortDate(reward.paidOn))
          : REFER.rewardAmount(amount)}
      </Text>
      <StatusPill size="sm" tone={REWARD_TONE[reward.status]} label={REFER.reward[reward.status]} />
    </View>
  );
}

/** People the customer referred, how each is going and the reward it earned (PRD 5.6). */
export function ReferralList() {
  const query = useQuery({
    queryKey: keys.referrals,
    queryFn: () => unwrap(api.customer.listReferrals()),
  });
  if (!query.data) return null;
  if (query.data.length === 0)
    return (
      <Text variant="label" tone="tertiary">
        {REFER.emptyBody}
      </Text>
    );
  return (
    <View style={styles.list}>
      <Text variant="overline" tone="tertiary">
        {REFER.historyTitle.toUpperCase()}
      </Text>
      {query.data.map((referral) => (
        <View key={referral.id} style={styles.entry}>
          <View style={styles.item}>
            <View style={styles.grow}>
              <Text variant="bodySm">{referral.name}</Text>
              <Text variant="label" tone="tertiary">
                {REFER.referredOn(momentDate(referral.createdAt))}
              </Text>
            </View>
            <StatusPill
              size="sm"
              tone={TONE[referral.status]}
              label={REFER.status[referral.status]}
            />
          </View>
          {referral.reward ? <RewardLine reward={referral.reward} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, paddingTop: 4 },
  entry: { gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reward: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  grow: { flex: 1 },
});
