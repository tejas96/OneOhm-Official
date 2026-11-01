import type { CustomerCover } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  ChoiceChips,
  describeError,
  ErrorState,
  LoadingState,
  Screen,
  StatusPill,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/screen-header';
import { COVER } from '@/copy/after-sales';
import { COMMON } from '@/copy/common';
import { longDate } from '@/lib/dates';
import { AMC_TONE, COVER_TONE } from './cover-card';
import { useCover } from './use-after-sales';

function AssetRow({ asset }: { readonly asset: CustomerCover['assets'][number] }) {
  return (
    <View style={styles.asset}>
      <View style={styles.assetHead}>
        <Text variant="titleMd" style={styles.fill}>
          {COVER.kinds[asset.kind]}
        </Text>
        <StatusPill
          size="sm"
          tone={COVER_TONE[asset.warrantyState]}
          label={COVER.state[asset.warrantyState]}
        />
      </View>
      <Text variant="bodySm" tone="secondary">
        {`${asset.quantity > 1 ? `${COVER.count(asset.quantity)} ` : ''}${[asset.make, asset.model]
          .filter(Boolean)
          .join(' · ')}`}
      </Text>
      <Text variant="label">{COVER.until(longDate(asset.warrantyEndsOn))}</Text>
      {asset.performanceEndsOn ? (
        <Text variant="label" tone="tertiary">
          {COVER.performance(longDate(asset.performanceEndsOn))}
        </Text>
      ) : null}
    </View>
  );
}

function AmcCard({ amc }: { readonly amc: CustomerCover['amc'] }) {
  const theme = useTheme();
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {COVER.amcTitle.toUpperCase()}
      </Text>
      {amc ? (
        <>
          <View style={styles.assetHead}>
            <Text variant="titleMd" style={styles.fill}>
              {amc.planName}
            </Text>
            <StatusPill size="sm" tone={AMC_TONE[amc.state]} label={COVER.amcState[amc.state]} />
          </View>
          <Text variant="bodySm" tone="secondary">
            {COVER.amcPeriod(longDate(amc.startsOn), longDate(amc.endsOn))}
          </Text>
          <Text variant="label">{COVER.amcVisits(amc.visitsDone, amc.visitsTotal)}</Text>
          {amc.includes.length > 0 ? (
            <View style={styles.includes}>
              <Text variant="label" tone="tertiary">
                {COVER.includes}
              </Text>
              {amc.includes.map((item) => (
                <View key={item} style={styles.include}>
                  <Check size={16} color={theme.colors.accent} />
                  <Text variant="bodySm">{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text variant="bodySm" tone="secondary">
            {COVER.noAmc}
          </Text>
          <Button
            label={COVER.ask}
            variant="secondary"
            size="sm"
            onPress={() => router.push({ pathname: '/help/new', params: { ask: 'amc' } })}
          />
        </>
      )}
    </Card>
  );
}

/** Every warranty on a home, with its end date, and the AMC with what each visit includes. */
export function WarrantyScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const query = useCover();
  const covers = query.data?.projects ?? [];
  const [chosen, setChosen] = useState<string | null>(params.projectId ?? null);
  const cover = covers.find((item) => item.projectId === chosen) ?? covers[0];
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <ScreenHeader title={COVER.title} overline={cover?.projectCode} />
      {query.isPending ? <LoadingState label={COVER.loading} /> : null}
      {query.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {covers.length > 1 ? (
        <ChoiceChips
          label={COMMON.tabs.home}
          choices={covers.map((item) => ({ value: item.projectId, label: item.projectCode }))}
          value={cover?.projectId ?? null}
          onChange={setChosen}
        />
      ) : null}
      {cover ? (
        <>
          <Card style={styles.card}>
            {cover.assets.length === 0 ? (
              <Text variant="bodySm" tone="secondary">
                {COVER.notYet}
              </Text>
            ) : (
              <>
                {cover.commissionedOn ? (
                  <Text variant="bodySm" tone="secondary">
                    {COVER.since(longDate(cover.commissionedOn))}
                  </Text>
                ) : null}
                {cover.assets.map((asset) => (
                  <AssetRow key={asset.kind} asset={asset} />
                ))}
              </>
            )}
          </Card>
          <AmcCard amc={cover.amc} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  asset: { gap: 4 },
  assetHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fill: { flex: 1 },
  includes: { gap: 6, paddingTop: 4 },
  include: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
