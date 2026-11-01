import type { CustomerProject } from '@oneohm/api-contracts';
import { Card, Text, useTheme } from '@oneohm/mobile-ui';
import { CalendarClock, CircleCheck, Hourglass } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { HOME } from '@/copy/home';
import { longDate, shortDate } from '@/lib/dates';
import { milestoneLabel } from '@/lib/journey';

/** Who the project is waiting on, and since when (PRD 5.2: delays with the reason). */
export function WaitingCard({ waiting }: { readonly waiting: NonNullable<CustomerProject['waiting']> }) {
  const theme = useTheme();
  const tone = theme.status.waiting;
  return (
    <View style={[styles.waiting, { backgroundColor: tone.tint }]} accessibilityRole="alert">
      <Hourglass size={20} color={tone.fg} />
      <View style={styles.fill}>
        <Text variant="titleMd" color={tone.fg}>
          {HOME.waiting[waiting.party]}
        </Text>
        <Text variant="bodySm" tone="secondary">
          {HOME.waitingBody[waiting.party]}
        </Text>
        <Text variant="label" tone="tertiary">
          {HOME.waitingSince(shortDate(waiting.since))}
        </Text>
      </View>
    </View>
  );
}

/** The one thing that happens next, with its planned date. */
export function NextStepCard({ next }: { readonly next: CustomerProject['nextStep'] }) {
  const theme = useTheme();
  return (
    <Card style={styles.next}>
      <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>
        <CalendarClock size={20} color={theme.colors.onAccentSoft} />
      </View>
      <View style={styles.fill}>
        <Text variant="overline" tone="tertiary">
          {HOME.nextTitle.toUpperCase()}
        </Text>
        {next ? (
          <>
            <Text variant="titleMd">{milestoneLabel(next)}</Text>
            <Text variant="bodySm" tone="secondary">
              {HOME.nextOn(longDate(next.date))}
            </Text>
          </>
        ) : (
          <Text variant="body" tone="secondary">
            {HOME.nothingNext}
          </Text>
        )}
      </View>
    </Card>
  );
}

/** What has been done for this home, newest first. */
export function UpdatesCard({ updates }: { readonly updates: CustomerProject['updates'] }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <SectionTitle title={HOME.updatesTitle.toUpperCase()} />
      <Card style={styles.updates}>
        {updates.length === 0 ? (
          <Text variant="body" tone="secondary">
            {HOME.noUpdates}
          </Text>
        ) : (
          updates.slice(0, 6).map((update, index) => (
            <View
              key={`${update.key}-${update.date}`}
              style={[
                styles.update,
                index > 0 && {
                  borderTopColor: theme.colors.borderSubtle,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <CircleCheck size={18} color={theme.colors.energy} />
              <View style={styles.fill}>
                <Text variant="body">{milestoneLabel(update)}</Text>
                <Text variant="label" tone="tertiary">
                  {shortDate(update.date)}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: 3 },
  waiting: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 20, alignItems: 'flex-start' },
  next: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 10 },
  updates: { paddingVertical: 6 },
  update: { flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'flex-start' },
});
