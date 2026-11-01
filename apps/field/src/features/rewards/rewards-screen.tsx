import type { MyRewards } from '@oneohm/api-contracts';
import {
  Card,
  describeError,
  ErrorState,
  Illustration,
  LoadingState,
  Screen,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader, SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { REWARDS } from '@/copy/engagement';
import { AchievementBadges } from './achievement-badges';
import { BonusList } from './bonus-list';
import { CustomerFeedback } from './customer-feedback';
import { PointsHistory } from './points-history';
import { useMyRewards } from './use-rewards';

/**
 * The person's engagement in one place (PRD 4.7): points, achievements from verified
 * work, project bonuses and incentive payments, what customers said, and the history.
 */
export function RewardsScreen() {
  const query = useMyRewards();
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <ScreenHeader overline={REWARDS.overline} title={REWARDS.title} />
      {query.isPending ? <LoadingState label={REWARDS.loading} /> : null}
      {query.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data ? <Rewards rewards={query.data} /> : null}
    </Screen>
  );
}

function Rewards({ rewards }: { readonly rewards: MyRewards }) {
  const theme = useTheme();
  return (
    <>
      <Card tone="ocean" style={styles.hero}>
        <View style={styles.heroText}>
          <Text variant="displayXl" color={theme.ocean.onPanel}>
            {rewards.points.total}
          </Text>
          <Text variant="label" color={theme.ocean.onPanelMuted}>
            {REWARDS.total} · {REWARDS.thisMonth(rewards.points.thisMonth)}
          </Text>
        </View>
        {/* The ocean panel is dark in both themes. */}
        <Illustration name="reward" size={76} scheme="dark" />
      </Card>
      <Section title={REWARDS.sections.achievements}>
        <AchievementBadges achievements={rewards.achievements} />
      </Section>
      <Section title={REWARDS.sections.money}>
        <BonusList rewards={rewards} />
      </Section>
      <Section title={REWARDS.sections.feedback} count={rewards.feedback.length}>
        <CustomerFeedback feedback={rewards.feedback} />
      </Section>
      <Section title={REWARDS.sections.history} count={rewards.points.history.length}>
        <PointsHistory entries={rewards.points.history} />
      </Section>
    </>
  );
}

function Section({
  title,
  count,
  children,
}: {
  readonly title: string;
  readonly count?: number;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <SectionTitle title={title} {...(count ? { count } : {})} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, gap: 12, flexDirection: 'row', alignItems: 'center' },
  heroText: { flex: 1, gap: 4 },
  section: { gap: 10 },
});
