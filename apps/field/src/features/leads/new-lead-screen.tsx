import { SUBSIDY_CATEGORIES, type SubsidyCategory } from '@oneohm/domain';
import {
  ApiError,
  Button,
  ChoiceChips,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Screen,
  Text,
  unwrap,
} from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { api, keys } from '@/api/api';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { COMMON } from '@/copy/common';
import { LEAD, NEW_LEAD } from '@/copy/sales';
import { businessClock, businessToday } from '@/lib/dates';
import { type Checks, isIndianMobile, passes, withoutKeys } from '@/lib/form';
import { useCurrentUser } from '@/session/session-provider';
import { defaultFollowUp, FollowUpDates, FollowUpTime } from './follow-up-dates';
import { NewLeadAlert } from './new-lead-alert';

/** Capture a lead on site in under a minute; duplicates point to the existing lead. */
export function NewLeadScreen() {
  const user = useCurrentUser();
  const client = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    city: '',
    size: '',
    nextNote: '',
    notes: '',
  });
  const [category, setCategory] = useState<SubsidyCategory>('individual');
  const [next, setNext] = useState(defaultFollowUp());
  const [time, setTime] = useState<string | null>(null);
  const [checks, setChecks] = useState<Checks>({});
  const set =
    (key: keyof typeof form, field: string = key) =>
    (value: string) => {
      setForm((current) => ({ ...current, [key]: value }));
      setChecks((current) => withoutKeys(current, field));
    };
  const minTime = next === businessToday() ? businessClock() : undefined;

  /** The size in watts; null when left empty, undefined when it is not a number. */
  const sizeWp = (): number | null | undefined => {
    const text = form.size.trim().replace(',', '.');
    if (!text) return null;
    if (!/^\d+(\.\d+)?$/.test(text)) return undefined;
    const wp = Math.round(Number.parseFloat(text) * 1000);
    return wp > 0 ? wp : undefined;
  };

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.crm.createLead({
          body: {
            name: form.name.trim(),
            phone: form.phone.trim(),
            city: form.city.trim(),
            source: user.kind === 'reseller' ? 'reseller' : 'employee',
            subsidyCategory: category,
            estimatedWp: sizeWp() ?? null,
            nextActionOn: next,
            nextActionTime: time,
            nextActionNote: form.nextNote.trim() || null,
            notes: form.notes.trim() || null,
          },
        }),
      ),
    onSuccess: async (lead) => {
      toast(NEW_LEAD.saved);
      await client.invalidateQueries({ queryKey: keys.leads });
      router.replace(`/leads/${lead.id}`);
    },
  });

  const submit = () => {
    if (save.isPending) return;
    const found: Record<string, string> = {};
    if (form.name.trim().length < 2) found.name = NEW_LEAD.nameRequired;
    if (!isIndianMobile(form.phone)) found.phone = NEW_LEAD.phoneInvalid;
    if (form.city.trim().length < 2) found.city = NEW_LEAD.cityRequired;
    if (sizeWp() === undefined) found.estimatedWp = NEW_LEAD.sizeInvalid;
    if (time && minTime && time < minTime) found.nextActionTime = LEAD.sheet.timeInPast;
    setChecks(found);
    if (!passes(found)) {
      save.reset();
      return;
    }
    save.mutate();
  };

  const errors = { ...fieldErrorsOf(save.error), ...checks };
  const duplicateId =
    save.error instanceof ApiError && save.error.code?.startsWith('duplicate_lead:')
      ? save.error.code.slice('duplicate_lead:'.length)
      : null;
  const generalError = save.error ? describeError(save.error) : null;

  return (
    <Screen
      footer={
        <Button
          label={NEW_LEAD.save}
          size="lg"
          fullWidth
          pending={save.isPending}
          onPress={submit}
        />
      }
    >
      <ScreenHeader title={NEW_LEAD.title} />
      <Text variant="body" tone="secondary">
        {NEW_LEAD.description}
      </Text>
      {generalError ? <NewLeadAlert message={generalError} duplicateId={duplicateId} /> : null}
      <Field label={NEW_LEAD.name} error={errors.name}>
        <Input
          value={form.name}
          onChangeText={set('name')}
          autoCapitalize="words"
          textContentType="name"
          maxLength={160}
          invalid={Boolean(errors.name)}
          accessibilityLabel={NEW_LEAD.name}
        />
      </Field>
      <Field label={NEW_LEAD.phone} error={errors.phone}>
        <Input
          value={form.phone}
          onChangeText={set('phone')}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          maxLength={16}
          invalid={Boolean(errors.phone)}
          accessibilityLabel={NEW_LEAD.phone}
        />
      </Field>
      <Field label={NEW_LEAD.city} error={errors.city}>
        <Input
          value={form.city}
          onChangeText={set('city')}
          autoCapitalize="words"
          maxLength={80}
          invalid={Boolean(errors.city)}
          accessibilityLabel={NEW_LEAD.city}
        />
      </Field>
      <Field label={NEW_LEAD.category}>
        <ChoiceChips
          kind="segmented"
          label={NEW_LEAD.category}
          choices={SUBSIDY_CATEGORIES.map((value) => ({
            value,
            label: NEW_LEAD.categories[value],
          }))}
          value={category}
          onChange={setCategory}
        />
      </Field>
      <Field
        label={NEW_LEAD.size}
        hint={NEW_LEAD.sizeHint}
        optional={COMMON.optional}
        error={errors.estimatedWp}
      >
        <Input
          value={form.size}
          onChangeText={set('size', 'estimatedWp')}
          keyboardType="decimal-pad"
          maxLength={8}
          invalid={Boolean(errors.estimatedWp)}
          accessibilityLabel={NEW_LEAD.size}
        />
      </Field>
      <Field label={NEW_LEAD.followUp} error={errors.nextActionOn}>
        <FollowUpDates
          label={NEW_LEAD.followUp}
          value={next}
          onChange={(value) => {
            setNext(value);
            setChecks((current) => withoutKeys(current, 'nextActionTime'));
          }}
        />
      </Field>
      <Field
        label={LEAD.sheet.time}
        hint={LEAD.sheet.timeHint}
        optional={COMMON.optional}
        error={errors.nextActionTime}
      >
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
      <Field label={NEW_LEAD.followUpNote} optional={COMMON.optional} error={errors.nextActionNote}>
        <Input
          value={form.nextNote}
          onChangeText={set('nextNote', 'nextActionNote')}
          placeholder={NEW_LEAD.followUpNotePlaceholder}
          maxLength={300}
          invalid={Boolean(errors.nextActionNote)}
          accessibilityLabel={NEW_LEAD.followUpNote}
        />
      </Field>
      <Field label={NEW_LEAD.notes} optional={COMMON.optional} error={errors.notes}>
        <Input
          value={form.notes}
          onChangeText={set('notes')}
          multiline
          maxLength={2000}
          invalid={Boolean(errors.notes)}
          accessibilityLabel={NEW_LEAD.notes}
        />
      </Field>
    </Screen>
  );
}
