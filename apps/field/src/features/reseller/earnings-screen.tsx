import { Card, describeError, ErrorState, LoadingState, Screen, Text } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { EARNINGS } from '@/copy/reseller';
import { EarningsTiles, ruleWords, StatementRow } from './earnings-parts';
import { useMyEarnings } from './use-reseller';

/** The reseller's commission: the rule, the totals and a statement of every entry. */
export function EarningsScreen() {
  const query = useMyEarnings();
  const earnings = query.data;
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <View style={styles.header}>
        <Text variant="displayLg">{EARNINGS.title}</Text>
      </View>
      {query.isPending ? <LoadingState label={EARNINGS.loading} /> : null}
      {query.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {earnings ? (
        <>
          <Card style={styles.rule}>
            <Text variant="overline" tone="tertiary">
              {EARNINGS.ruleTitle.toUpperCase()}
            </Text>
            <Text variant="body">{ruleWords(earnings.rule)}</Text>
            {earnings.rule.active ? (
              <Text variant="label" tone="tertiary">
                {EARNINGS.ruleNote}
              </Text>
            ) : null}
          </Card>
          <EarningsTiles earnings={earnings} />
          <View style={styles.list}>
            <Text variant="overline" tone="tertiary">
              {EARNINGS.historyTitle.toUpperCase()}
            </Text>
            {earnings.entries.length === 0 ? (
              <Text variant="bodySm" tone="secondary">
                {EARNINGS.historyEmpty}
              </Text>
            ) : (
              earnings.entries.map((entry) => <StatementRow key={entry.id} entry={entry} />)
            )}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, paddingTop: 8 },
  rule: { gap: 6, paddingVertical: 16 },
  list: { gap: 10, paddingTop: 4 },
});
