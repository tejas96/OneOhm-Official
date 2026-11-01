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
  useTheme,
} from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { COMMON } from '@/copy/common';
import { NEW_LEAD } from '@/copy/sales';
import { useCurrentUser } from '@/session/session-provider';
import { defaultFollowUp, FollowUpDates } from './follow-up-dates';

/** Capture a lead on site in under a minute; duplicates point to the existing lead. */
export function NewLeadScreen() {
  const theme = useTheme();
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
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const kw = Number.parseFloat(form.size.replace(',', '.'));
      return unwrap(
        api.crm.createLead({
          body: {
            name: form.name,
            phone: form.phone,
            city: form.city,
            source: user.kind === 'reseller' ? 'reseller' : 'employee',
            subsidyCategory: category,
            estimatedWp: Number.isFinite(kw) && kw > 0 ? Math.round(kw * 1000) : null,
            nextActionOn: next,
            nextActionNote: form.nextNote.trim() || null,
            notes: form.notes.trim() || null,
          },
        }),
      );
    },
    onSuccess: async (lead) => {
      toast(NEW_LEAD.saved);
      await client.invalidateQueries({ queryKey: keys.leads });
      router.replace(`/leads/${lead.id}`);
    },
  });

  const errors = fieldErrorsOf(save.error);
  const duplicateId =
    save.error instanceof ApiError && save.error.code?.startsWith('duplicate_lead:')
      ? save.error.code.slice('duplicate_lead:'.length)
      : null;
  const generalError =
    save.error && Object.keys(errors).length === 0 ? describeError(save.error) : null;

  return (
    <Screen
      footer={
        <Button
          label={NEW_LEAD.save}
          size="lg"
          fullWidth
          pending={save.isPending}
          onPress={() => save.mutate()}
        />
      }
    >
      <ScreenHeader title={NEW_LEAD.title} />
      <Text variant="body" tone="secondary">
        {NEW_LEAD.description}
      </Text>
      {generalError ? (
        <View
          style={[styles.alert, { backgroundColor: theme.status.overdue.tint }]}
          accessibilityRole="alert"
        >
          <Text variant="bodySm" color={theme.status.overdue.fg}>
            {generalError}
          </Text>
          {duplicateId ? (
            <Button
              label={NEW_LEAD.openExisting}
              variant="secondary"
              size="sm"
              onPress={() => router.replace(`/leads/${duplicateId}`)}
            />
          ) : null}
        </View>
      ) : null}
      <Field label={NEW_LEAD.name} error={errors.name}>
        <Input
          value={form.name}
          onChangeText={set('name')}
          autoCapitalize="words"
          textContentType="name"
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
          invalid={Boolean(errors.phone)}
          accessibilityLabel={NEW_LEAD.phone}
        />
      </Field>
      <Field label={NEW_LEAD.city} error={errors.city}>
        <Input
          value={form.city}
          onChangeText={set('city')}
          autoCapitalize="words"
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
          onChangeText={set('size')}
          keyboardType="decimal-pad"
          accessibilityLabel={NEW_LEAD.size}
        />
      </Field>
      <Field label={NEW_LEAD.followUp} error={errors.nextActionOn}>
        <FollowUpDates label={NEW_LEAD.followUp} value={next} onChange={setNext} />
      </Field>
      <Field label={NEW_LEAD.followUpNote} optional={COMMON.optional}>
        <Input
          value={form.nextNote}
          onChangeText={set('nextNote')}
          placeholder={NEW_LEAD.followUpNotePlaceholder}
          accessibilityLabel={NEW_LEAD.followUpNote}
        />
      </Field>
      <Field label={NEW_LEAD.notes} optional={COMMON.optional}>
        <Input
          value={form.notes}
          onChangeText={set('notes')}
          multiline
          accessibilityLabel={NEW_LEAD.notes}
        />
      </Field>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alert: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
});
