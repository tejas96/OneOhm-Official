import type { LeadDetail } from '@oneohm/api-contracts';
import {
  Button,
  ChoiceChips,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Sheet,
  Text,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, keys } from '@/api/api';
import { useToast } from '@/components/toast';
import { COMMON } from '@/copy/common';
import { LEAD } from '@/copy/sales';
import { businessClock, businessToday } from '@/lib/dates';
import { type Checks, passes, withoutKeys } from '@/lib/form';
import { useCurrentUser } from '@/session/session-provider';
import { defaultFollowUp, FollowUpDates, FollowUpTime } from './follow-up-dates';

const KINDS = ['call', 'visit', 'whatsapp', 'note'] as const;
type Kind = (typeof KINDS)[number];

/**
 * Log what happened with a lead and when to come back to it, in one sheet. On a
 * reseller's lead, staff notes stay staff-only unless switched off (PRD 4.8).
 */
export function FollowUpSheet({
  lead,
  open,
  onClose,
}: {
  readonly lead: LeadDetail;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const theme = useTheme();
  const client = useQueryClient();
  const toast = useToast();
  const user = useCurrentUser();
  const leadId = lead.id;
  const [kind, setKind] = useState<Kind>('call');
  const [note, setNote] = useState('');
  // An overdue follow-up starts at tomorrow: the server refuses a day in the past.
  const [next, setNext] = useState(() =>
    lead.nextActionOn && lead.nextActionOn >= businessToday()
      ? lead.nextActionOn
      : defaultFollowUp(),
  );
  const [time, setTime] = useState<string | null>(lead.nextActionTime);
  const [nextNote, setNextNote] = useState('');
  const canHide = lead.fromReseller && user.kind !== 'reseller';
  const [internal, setInternal] = useState(true);
  const [checks, setChecks] = useState<Checks>({});
  const isToday = next === businessToday();
  const minTime = isToday ? businessClock() : undefined;

  const save = useMutation({
    // The date update goes first and is safe to repeat; the activity goes last,
    // so a failed save never leaves half of it behind and a retry adds no copy.
    mutationFn: async () => {
      await unwrap(
        api.crm.updateLead({
          params: { id: leadId },
          body: {
            nextActionOn: next,
            nextActionTime: time,
            ...(nextNote.trim() ? { nextActionNote: nextNote.trim() } : {}),
          },
        }),
      );
      return unwrap(
        api.crm.addLeadActivity({
          params: { id: leadId },
          body: { kind, note: note.trim(), ...(canHide ? { internal } : {}) },
        }),
      );
    },
    onSuccess: async (lead) => {
      client.setQueryData(['lead', leadId], lead);
      await client.invalidateQueries({ queryKey: keys.leads });
      toast(LEAD.logged);
      setNote('');
      setNextNote('');
      onClose();
    },
  });
  const errors = { ...fieldErrorsOf(save.error), ...checks };

  const submit = () => {
    if (save.isPending) return;
    const found: Record<string, string> = {};
    if (!note.trim()) found.note = LEAD.sheet.noteRequired;
    if (next < businessToday()) found.nextActionOn = LEAD.sheet.dateInPast;
    if (time && minTime && time < minTime) found.nextActionTime = LEAD.sheet.timeInPast;
    setChecks(found);
    if (!passes(found)) {
      save.reset();
      return;
    }
    save.mutate();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={LEAD.sheet.title}
      description={LEAD.sheet.description}
      closeLabel={COMMON.close}
      footer={
        <Button
          label={LEAD.sheet.save}
          size="lg"
          fullWidth
          pending={save.isPending}
          onPress={submit}
        />
      }
    >
      <Field label={LEAD.sheet.kind}>
        <ChoiceChips
          kind="segmented"
          label={LEAD.sheet.kind}
          choices={KINDS.map((value) => ({ value, label: LEAD.activity[value] }))}
          value={kind}
          onChange={setKind}
        />
      </Field>
      <Field label={LEAD.sheet.note} error={errors.note}>
        <Input
          value={note}
          onChangeText={(value) => {
            setNote(value);
            setChecks((current) => withoutKeys(current, 'note'));
          }}
          placeholder={LEAD.sheet.notePlaceholder}
          multiline
          maxLength={2000}
          invalid={Boolean(errors.note)}
          accessibilityLabel={LEAD.sheet.note}
        />
      </Field>
      {canHide ? (
        <Field label={LEAD.sheet.audience} hint={LEAD.staffOnlyHint}>
          <ChoiceChips
            kind="segmented"
            label={LEAD.sheet.audience}
            choices={[
              { value: 'staff', label: LEAD.staffOnly },
              { value: 'shared', label: LEAD.sharedWithReseller },
            ]}
            value={internal ? 'staff' : 'shared'}
            onChange={(value) => setInternal(value === 'staff')}
          />
        </Field>
      ) : null}
      <Field label={LEAD.sheet.next} error={errors.nextActionOn}>
        <FollowUpDates
          label={LEAD.sheet.next}
          value={next}
          onChange={(value) => {
            setNext(value);
            setChecks((current) => withoutKeys(current, 'nextActionOn', 'nextActionTime'));
          }}
        />
      </Field>
      <Field label={LEAD.sheet.time} hint={LEAD.sheet.timeHint} error={errors.nextActionTime}>
        <FollowUpTime
          label={LEAD.sheet.time}
          value={time}
          onChange={(value) => {
            setTime(value);
            setChecks((current) => withoutKeys(current, 'nextActionTime'));
          }}
          minTime={minTime}
        />
      </Field>
      <Field label={LEAD.sheet.nextNote} optional={COMMON.optional} error={errors.nextActionNote}>
        <Input
          value={nextNote}
          onChangeText={setNextNote}
          placeholder={LEAD.sheet.nextNotePlaceholder}
          maxLength={300}
          invalid={Boolean(errors.nextActionNote)}
          accessibilityLabel={LEAD.sheet.nextNote}
        />
      </Field>
      {save.error ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {describeError(save.error)}
        </Text>
      ) : null}
    </Sheet>
  );
}
