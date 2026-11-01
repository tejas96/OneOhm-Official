import {
  Button,
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
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { FormAlert } from '@/components/form-alert';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { REFER } from '@/copy/care';
import { COMMON } from '@/copy/common';
import { ReferralCodeCard, referralProgramKey } from './referral-code-card';
import { ReferralList } from './referral-list';

export { ReferralList };

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
      await client.invalidateQueries({ queryKey: referralProgramKey });
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
      <ReferralCodeCard />
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
  form: { gap: 16 },
});
