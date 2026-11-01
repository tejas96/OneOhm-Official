import type { Referral } from '@oneohm/api-contracts';
import {
  Button,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Screen,
  StatusPill,
  Text,
  type Tone,
  unwrap,
} from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { FormAlert } from '@/components/form-alert';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { REFER } from '@/copy/care';
import { COMMON } from '@/copy/common';
import { momentDate } from '@/lib/dates';

const TONE: Readonly<Record<Referral['status'], Tone>> = {
  received: 'waiting',
  in_progress: 'onTrack',
  installed: 'done',
  closed: 'neutral',
};

/** People the customer referred, and how each is going (PRD 5.6). */
export function ReferralList() {
  const query = useQuery({
    queryKey: keys.referrals,
    queryFn: () => unwrap(api.customer.listReferrals()),
  });
  if (!query.data) return null;
  if (query.data.length === 0)
    return (
      <Text variant="label" tone="tertiary">
        {REFER.emptyBody}
      </Text>
    );
  return (
    <View style={styles.list}>
      <Text variant="overline" tone="tertiary">
        {REFER.historyTitle.toUpperCase()}
      </Text>
      {query.data.map((referral) => (
        <View key={referral.id} style={styles.item}>
          <View style={styles.grow}>
            <Text variant="bodySm">{referral.name}</Text>
            <Text variant="label" tone="tertiary">
              {REFER.referredOn(momentDate(referral.createdAt))}
            </Text>
          </View>
          <StatusPill
            size="sm"
            tone={TONE[referral.status]}
            label={REFER.status[referral.status]}
          />
        </View>
      ))}
    </View>
  );
}

/** Name and number of someone who wants solar; the sales team calls them. */
export function ReferScreen() {
  const toast = useToast();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const send = useMutation({
    mutationFn: () =>
      unwrap(
        api.customer.createReferral({
          body: { name, phone, ...(city.trim() ? { city } : {}) },
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.referrals });
      toast(REFER.sent);
      setName('');
      setPhone('');
      setCity('');
      router.back();
    },
  });
  const errors = send.error ? fieldErrorsOf(send.error) : {};
  const general = send.error && !errors.name && !errors.phone ? describeError(send.error) : null;
  return (
    <Screen
      footer={
        <Button
          label={REFER.submit}
          onPress={() => send.mutate()}
          pending={send.isPending}
          disabled={name.trim().length < 2 || phone.replace(/\D/g, '').length < 10}
          fullWidth
        />
      }
    >
      <ScreenHeader title={REFER.title} />
      <Text variant="body" tone="secondary">
        {REFER.intro}
      </Text>
      <View style={styles.form}>
        <Field label={REFER.nameLabel} error={errors.name}>
          <Input
            value={name}
            accessibilityLabel={REFER.nameLabel}
            onChangeText={setName}
            autoComplete="name"
            invalid={Boolean(errors.name)}
          />
        </Field>
        <Field label={REFER.phoneLabel} error={errors.phone}>
          <Input
            value={phone}
            accessibilityLabel={REFER.phoneLabel}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            invalid={Boolean(errors.phone)}
          />
        </Field>
        <Field label={REFER.cityLabel} optional={COMMON.optional}>
          <Input value={city} onChangeText={setCity} accessibilityLabel={REFER.cityLabel} />
        </Field>
        <FormAlert message={general} />
      </View>
      <ReferralList />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, paddingTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  form: { gap: 16 },
});
