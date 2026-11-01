import type { TravelDay } from '@oneohm/api-contracts';
import {
  Button,
  ChoiceChips,
  describeError,
  ErrorState,
  Field,
  formatInr,
  Input,
  LoadingState,
  Screen,
  StatusPill,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { ReceiptIndianRupee } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { COMMON } from '@/copy/common';
import { TRAVEL } from '@/copy/site';
import { useWorkday } from '@/features/attendance/use-workday';
import { TrackingStatus } from '@/features/site/tracking-status';
import { addDays, businessToday, shortDate } from '@/lib/dates';
import { ClaimCard, stateOf } from './claim-card';
import { ClaimProject, defaultProject } from './claim-project';
import { RouteCard } from './route-card';
import { useClaimActions, useMyClaims, useTravelDay } from './use-travel';

const DAYS_BACK = 6;

function dayChoices(today: string) {
  return Array.from({ length: DAYS_BACK + 1 }, (_, index) => {
    const date = addDays(today, -index);
    const label =
      index === 0 ? TRAVEL.days.today : index === 1 ? TRAVEL.days.yesterday : shortDate(date);
    return { value: date, label };
  });
}

/** The day's travel between sites and the claim for it (PRD 4.3). */
export function TravelScreen() {
  const today = businessToday();
  const [date, setDate] = useState(today);
  const day = useTravelDay(date);
  const claims = useMyClaims();
  const workday = useWorkday();
  return (
    <Screen
      refreshing={day.isRefetching}
      onRefresh={() => {
        void day.refetch();
        void claims.refetch();
      }}
    >
      <ScreenHeader overline={TRAVEL.overline} title={TRAVEL.title} />
      {workday.data?.tracking ? <TrackingStatus state={workday.data.tracking} /> : null}
      <ChoiceChips
        choices={dayChoices(today)}
        value={date}
        onChange={setDate}
        label={TRAVEL.pickDay}
      />
      {day.isPending ? <LoadingState label={TRAVEL.loading} /> : null}
      {day.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(day.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void day.refetch()}
        />
      ) : null}
      {day.data ? (
        <>
          <RouteCard day={day.data} />
          <ClaimBox key={day.data.workDate} day={day.data} />
        </>
      ) : null}
      <View style={styles.section}>
        <Text variant="titleMd">{TRAVEL.mine}</Text>
        {claims.data?.length === 0 ? (
          <Text variant="bodySm" tone="secondary">
            {TRAVEL.noClaims}
          </Text>
        ) : null}
        {claims.data?.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} />
        ))}
      </View>
    </Screen>
  );
}

/** The claim for the shown day: make one with a note, see it, or cancel it while waiting. */
function ClaimBox({ day }: { readonly day: TravelDay }) {
  const theme = useTheme();
  const toast = useToast();
  const { claim, cancel } = useClaimActions();
  const [note, setNote] = useState('');
  const [projectId, setProjectId] = useState(() => defaultProject(day));
  const live = day.claim && (day.claim.status === 'pending' || day.claim.status === 'approved');
  if (live && day.claim) {
    const state = stateOf(day.claim);
    return (
      <View style={styles.box}>
        <Text variant="bodySm" tone="secondary">
          {TRAVEL.claimedFor(formatInr(day.claim.amountPaise), day.claim.distanceM)}
        </Text>
        <StatusPill tone={state === 'pending' ? 'review' : 'done'} label={TRAVEL.status[state]} />
        {day.claim.status === 'pending' ? (
          <Button
            label={TRAVEL.cancel}
            variant="quiet"
            size="sm"
            pending={cancel.isPending}
            onPress={() =>
              day.claim &&
              cancel.mutate(day.claim.id, {
                onSuccess: () => toast(TRAVEL.cancelled),
                onError: (error) => toast(describeError(error)),
              })
            }
          />
        ) : null}
      </View>
    );
  }
  if (!day.claimable) {
    return day.visits.length > 0 ? (
      <Text variant="bodySm" tone="secondary">
        {TRAVEL.nothingToClaim}
      </Text>
    ) : null;
  }
  return (
    <View style={styles.form}>
      <ClaimProject day={day} value={projectId} onChange={setProjectId} />
      <Field label={TRAVEL.note} hint={TRAVEL.noteHint} optional={COMMON.optional}>
        <Input value={note} onChangeText={setNote} maxLength={500} />
      </Field>
      <Button
        label={TRAVEL.claim}
        icon={<ReceiptIndianRupee size={18} color={theme.colors.onAccent} />}
        pending={claim.isPending}
        fullWidth
        onPress={() =>
          claim.mutate(
            { workDate: day.workDate, note: note.trim() || null, projectId },
            {
              onSuccess: () => toast(TRAVEL.claimed),
              onError: (error) => toast(describeError(error)),
            },
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  box: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  form: { gap: 12 },
});
