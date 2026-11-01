import type { CustomerCover, CustomerVisit } from '@oneohm/api-contracts';
import { Button, Card, StatusPill, Text, type Tone, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { CalendarClock, ShieldCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { COVER, VISITS } from '@/copy/after-sales';
import { longDate, shortDate } from '@/lib/dates';
import { useCover } from './use-after-sales';

export const COVER_TONE: Readonly<Record<CustomerCover['assets'][number]['warrantyState'], Tone>> =
  {
    active: 'onTrack',
    ending_soon: 'atRisk',
    ended: 'neutral',
  };

export const AMC_TONE: Readonly<Record<NonNullable<CustomerCover['amc']>['state'], Tone>> = {
  upcoming: 'waiting',
  active: 'onTrack',
  ended: 'neutral',
  cancelled: 'neutral',
};

const VISIT_TONE: Readonly<Record<NonNullable<CustomerVisit['status']> | 'planned', Tone>> = {
  planned: 'neutral',
  open: 'waiting',
  in_progress: 'onTrack',
  resolved: 'done',
};

/** The longest product cover for one home, in one line, with a way into the details. */
export function CoverCard({ projectId }: { readonly projectId: string | null }) {
  const theme = useTheme();
  const query = useCover();
  const cover =
    query.data?.projects.find((item) => item.projectId === projectId) ?? query.data?.projects[0];
  if (!cover) return null;
  const panel = cover.assets.find((asset) => asset.kind === 'panel');
  const inverter = cover.assets.find((asset) => asset.kind === 'inverter');
  return (
    <Card style={styles.card}>
      <View style={styles.headRow}>
        <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>
          <ShieldCheck size={20} color={theme.colors.onAccentSoft} />
        </View>
        <View style={styles.fill}>
          <Text variant="overline" tone="tertiary">
            {COVER.cardTitle.toUpperCase()}
          </Text>
          <Text variant="titleMd">{cover.projectCode}</Text>
        </View>
        {cover.amc ? (
          <StatusPill
            size="sm"
            tone={AMC_TONE[cover.amc.state]}
            label={COVER.amcState[cover.amc.state]}
          />
        ) : null}
      </View>
      {cover.assets.length === 0 ? (
        <Text variant="bodySm" tone="secondary">
          {COVER.notYet}
        </Text>
      ) : (
        <View style={styles.lines}>
          {[panel, inverter].map((asset) =>
            asset ? (
              <Text key={asset.kind} variant="bodySm" tone="secondary">
                {`${COVER.kinds[asset.kind]}: ${COVER.until(longDate(asset.warrantyEndsOn))}`}
              </Text>
            ) : null,
          )}
          {cover.amc ? (
            <Text variant="bodySm" tone="secondary">
              {`${cover.amc.planName}: ${COVER.amcVisits(cover.amc.visitsDone, cover.amc.visitsTotal)}`}
            </Text>
          ) : null}
        </View>
      )}
      <Button
        label={COVER.details}
        variant="secondary"
        size="sm"
        onPress={() =>
          router.push({ pathname: '/help/warranty', params: { projectId: cover.projectId } })
        }
      />
    </Card>
  );
}

/** Free AMC visits coming up, nearest first. */
export function VisitsCard() {
  const theme = useTheme();
  const visits = useCover().data?.upcomingVisits ?? [];
  if (visits.length === 0) return null;
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {VISITS.title.toUpperCase()}
      </Text>
      {visits.slice(0, 3).map((visit) => {
        const state = visit.status ?? 'planned';
        return (
          <View key={visit.id} style={styles.visit}>
            <CalendarClock size={18} color={theme.colors.accent} />
            <View style={styles.fill}>
              <Text variant="titleMd">{VISITS.on(shortDate(visit.dueOn))}</Text>
              <Text variant="bodySm" tone="secondary">
                {`${VISITS.visit(visit.visitName)} · ${VISITS.under(visit.planName, visit.projectCode)}`}
              </Text>
            </View>
            <StatusPill size="sm" tone={VISIT_TONE[state]} label={VISITS.status[state]} />
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
  lines: { gap: 4 },
  visit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
