import type { ServiceVisit } from '@oneohm/api-contracts';
import { Button, Card, describeError, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { LogIn, LogOut } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useToast } from '@/components/toast';
import { SERVICE } from '@/copy/service';
import { SITE } from '@/copy/site';
import { ConsentPrompt } from '@/features/attendance/consent-prompt';
import { TrackingStatus } from '@/features/site/tracking-status';
import type { Missed } from '@/features/site/use-task-site';
import { VisitLine } from '@/features/site/visit-line';
import { useServiceSiteAction } from './use-service-visits';

function missedNote(missed: Missed): string | null {
  if (missed === 'denied') return SITE.denied;
  if (missed === 'nofix') return SITE.noFix;
  return null;
}

/** Leaves for the visit the person is still checked in on elsewhere. */
function openElsewhere(visit: NonNullable<ServiceVisit['openVisit']>) {
  if (visit.serviceRequestId) {
    router.push({ pathname: '/service/[id]', params: { id: visit.serviceRequestId } });
  } else if (visit.taskId) {
    router.push({ pathname: '/tasks/[id]', params: { id: visit.taskId } });
  }
}

/** Check out when here; check in when checked in nowhere (with what it tells the customer). */
function CheckInButtons({
  visit,
  here,
  free,
  onCheckIn,
  onCheckOut,
  checkingIn,
  checkingOut,
}: {
  readonly visit: ServiceVisit;
  readonly here: boolean;
  readonly free: boolean;
  readonly onCheckIn: () => void;
  readonly onCheckOut: () => void;
  readonly checkingIn: boolean;
  readonly checkingOut: boolean;
}) {
  const theme = useTheme();
  if (here) {
    return (
      <Button
        label={SITE.checkOut}
        variant="secondary"
        icon={<LogOut size={18} color={theme.colors.textPrimary} />}
        pending={checkingOut}
        onPress={onCheckOut}
        fullWidth
      />
    );
  }
  if (!free) return null;
  return (
    <>
      <Button
        label={SITE.checkIn}
        icon={<LogIn size={18} color={theme.colors.onAccent} />}
        pending={checkingIn}
        onPress={onCheckIn}
        fullWidth
      />
      {visit.status === 'open' ? (
        <Text variant="label" tone="tertiary">
          {SERVICE.checkInHint}
        </Text>
      ) : null}
    </>
  );
}

/**
 * Checking in and out at the customer's site for a service visit, with the same rules
 * as task visits (PRD 4.2, 4.3): location only with consent in working hours, a far
 * check-in flagged and never refused. Checking in answers the request.
 */
export function ServiceCheckInCard({ visit }: { readonly visit: ServiceVisit }) {
  const toast = useToast();
  const checkIn = useServiceSiteAction(visit.id, 'in');
  const checkOut = useServiceSiteAction(visit.id, 'out');
  const open = visit.openVisit;
  const here = open?.serviceRequestId === visit.id ? open : null;
  const elsewhere = open && !here ? open : null;
  const earlier = visit.visits.filter((item) => item.id !== here?.id).slice(0, 3);
  const askConsent = visit.tracking.state === 'no_consent' && !visit.tracking.answered;
  const run = (action: typeof checkIn, done: string) =>
    action.mutate(visit.tracking, {
      onSuccess: ({ missed }) => toast(missedNote(missed) ?? done),
      onError: (error) => toast(describeError(error)),
    });
  if (!visit.canWork && visit.visits.length === 0) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="overline" tone="tertiary">
          {SITE.title.toUpperCase()}
        </Text>
        {visit.canWork ? (
          <TrackingStatus state={visit.tracking.state} hours={visit.tracking.hours} />
        ) : null}
      </View>
      {visit.canWork && askConsent ? <ConsentPrompt days={visit.tracking.retentionDays} /> : null}
      {here ? <VisitLine visit={here} /> : null}
      {visit.canWork && elsewhere ? (
        <PressableScale accessibilityRole="button" onPress={() => openElsewhere(elsewhere)}>
          <Text variant="bodySm" tone="accent">
            {SITE.elsewhere(elsewhere.taskTitle ?? '')}
          </Text>
        </PressableScale>
      ) : null}
      {visit.canWork ? (
        <CheckInButtons
          visit={visit}
          here={Boolean(here)}
          free={!open}
          onCheckIn={() => run(checkIn, SITE.checkedIn)}
          onCheckOut={() => run(checkOut, SITE.checkedOut)}
          checkingIn={checkIn.isPending}
          checkingOut={checkOut.isPending}
        />
      ) : null}
      {earlier.length > 0 ? (
        <View style={styles.past}>
          <Text variant="label" tone="tertiary">
            {SITE.past}
          </Text>
          {earlier.map((item) => (
            <VisitLine key={item.id} visit={item} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  past: { gap: 10, paddingTop: 4 },
});
