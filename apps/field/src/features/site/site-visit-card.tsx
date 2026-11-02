import type { ProjectTask, TaskSite } from '@oneohm/api-contracts';
import { Button, Card, describeError, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { LogIn, LogOut, MapPinned } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useToast } from '@/components/toast';
import { SITE } from '@/copy/site';
import { ConsentPrompt } from '@/features/attendance/consent-prompt';
import { buttonState } from './button-state';
import { SitePlaceActions } from './site-place-actions';
import { TrackingStatus } from './tracking-status';
import { mapsEnabled, usePinRoof } from './use-pin-roof';
import { type Missed, useSiteAction, useTaskSite } from './use-task-site';
import { VisitLine } from './visit-line';

function missedNote(missed: Missed): string | null {
  if (missed === 'denied') return SITE.denied;
  if (missed === 'nofix') return SITE.noFix;
  return null;
}

/**
 * Checking in and out at the customer's site for a survey, installation or inspection
 * (PRD 4.2). Shows whether location is on, flags a far check-in, never blocks one.
 */
export function SiteVisitCard({ task }: { readonly task: ProjectTask }) {
  const query = useTaskSite(task.id);
  const data = query.data;
  if (!data?.kind) return null;
  return <SiteCard task={task} site={data} />;
}

function SiteCard({ task, site }: { readonly task: ProjectTask; readonly site: TaskSite }) {
  const theme = useTheme();
  const toast = useToast();
  const checkIn = useSiteAction(task.id, 'in');
  const checkOut = useSiteAction(task.id, 'out');
  const save = useSiteAction(task.id, 'save');
  const pin = usePinRoof(task.id, site);
  const open = site.openVisit;
  const here = open?.taskId === task.id ? open : null;
  const elsewhere = open && !here ? open : null;
  const earlier = site.visits.filter((visit) => visit.id !== here?.id).slice(0, 3);
  const askConsent = site.tracking.state === 'no_consent' && !site.tracking.answered;
  const run = (action: typeof checkIn, done: string) =>
    action.mutate(
      { tracking: site.tracking },
      {
        onSuccess: ({ missed }) => toast(missedNote(missed) ?? done),
        onError: (error) => toast(describeError(error)),
      },
    );

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="overline" tone="tertiary">
          {SITE.title.toUpperCase()}
        </Text>
        <TrackingStatus state={site.tracking.state} hours={site.tracking.hours} />
      </View>
      <Text variant="bodySm" tone="secondary">
        {[SITE.kinds[site.kind ?? 'installation'], site.siteLabel].filter(Boolean).join(' · ')}
      </Text>
      {askConsent ? <ConsentPrompt days={site.tracking.retentionDays} /> : null}
      {here ? <VisitLine visit={here} /> : null}
      {!mapsEnabled && here && site.canSetSite ? (
        <Button
          label={SITE.saveSite}
          size="sm"
          variant="secondary"
          icon={<MapPinned size={16} color={theme.colors.textPrimary} />}
          pending={save.isPending}
          onPress={() => run(save, SITE.siteSaved)}
        />
      ) : null}
      <SitePlaceActions site={site} pin={pin} />
      {elsewhere ? (
        <PressableScale
          accessibilityRole="button"
          onPress={() => {
            if (elsewhere.serviceRequestId) {
              router.push({
                pathname: '/service/[id]',
                params: { id: elsewhere.serviceRequestId },
              });
            } else if (elsewhere.taskId) {
              router.push({ pathname: '/tasks/[id]', params: { id: elsewhere.taskId } });
            }
          }}
        >
          <Text variant="bodySm" tone="accent">
            {SITE.elsewhere(elsewhere.taskTitle ?? '')}
          </Text>
        </PressableScale>
      ) : null}
      {here ? (
        <Button
          {...buttonState(checkOut.isPending, checkOut.label, SITE.checkOut)}
          variant="secondary"
          icon={<LogOut size={18} color={theme.colors.textPrimary} />}
          // A roof pin waiting for signal goes first: it needs the open visit.
          onPress={() => void pin.flush().then(() => run(checkOut, SITE.checkedOut))}
          fullWidth
        />
      ) : null}
      {!here && !elsewhere && task.status !== 'completed' ? (
        <Button
          {...buttonState(checkIn.isPending, checkIn.label, SITE.checkIn)}
          icon={<LogIn size={18} color={theme.colors.onAccent} />}
          onPress={() => run(checkIn, SITE.checkedIn)}
          fullWidth
        />
      ) : null}
      {earlier.length > 0 ? (
        <View style={styles.past}>
          <Text variant="label" tone="tertiary">
            {SITE.past}
          </Text>
          {earlier.map((visit) => (
            <VisitLine key={visit.id} visit={visit} />
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
