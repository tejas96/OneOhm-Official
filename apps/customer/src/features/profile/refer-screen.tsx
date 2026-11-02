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
import { indianMobile } from '@/lib/phone';
import { ReferralCodeCard, referralProgramKey } from './referral-code-card';
import { ReferralList } from './referral-list';

export { ReferralList };

/** Name and number of someone who wants solar; the sales team calls them. */
type ReferField = 'name' | 'phone' | 'city';

export function ReferScreen() {
  const toast = useToast();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [checked, setChecked] = useState<Partial<Record<ReferField, string | undefined>>>({});
  const send = useMutation({
    mutationFn: (body: { name: string; phone: string; city?: string }) =>
      unwrap(api.customer.createReferral({ body })),
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
  const server = send.error ? fieldErrorsOf(send.error) : {};
  const errorOf = (field: ReferField) => checked[field] ?? server[field];
  const submit = () => {
    const mobile = indianMobile(phone);
    const found: Partial<Record<ReferField, string | undefined>> = {};
    if (!name.trim()) found.name = COMMON.required;
    else if (name.trim().length < 2) found.name = COMMON.nameShort;
    if (!phone.trim()) found.phone = COMMON.required;
    else if (!mobile) found.phone = COMMON.phoneInvalid;
    setChecked(found);
    if (Object.keys(found).length > 0 || !mobile) {
      send.reset();
      return;
    }
    send.mutate({
      name: name.trim(),
      phone: mobile,
      ...(city.trim() ? { city: city.trim() } : {}),
    });
  };
  const change = (field: ReferField, set: (value: string) => void) => (value: string) => {
    set(value);
    if (checked[field]) setChecked((current) => ({ ...current, [field]: undefined }));
  };
  return (
    <Screen
      footer={<Button label={REFER.submit} onPress={submit} pending={send.isPending} fullWidth />}
    >
      <ScreenHeader title={REFER.title} />
      <ReferralCodeCard />
      <Text variant="body" tone="secondary">
        {REFER.intro}
      </Text>
      <View style={styles.form}>
        <Field label={REFER.nameLabel} error={errorOf('name')}>
          <Input
            value={name}
            accessibilityLabel={REFER.nameLabel}
            onChangeText={change('name', setName)}
            autoComplete="name"
            maxLength={160}
            invalid={Boolean(errorOf('name'))}
          />
        </Field>
        <Field label={REFER.phoneLabel} error={errorOf('phone')}>
          <Input
            value={phone}
            accessibilityLabel={REFER.phoneLabel}
            onChangeText={change('phone', setPhone)}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={16}
            invalid={Boolean(errorOf('phone'))}
          />
        </Field>
        <Field label={REFER.cityLabel} optional={COMMON.optional} error={errorOf('city')}>
          <Input
            value={city}
            onChangeText={change('city', setCity)}
            accessibilityLabel={REFER.cityLabel}
            maxLength={120}
            invalid={Boolean(errorOf('city'))}
          />
        </Field>
        <FormAlert message={send.error ? describeError(send.error) : null} />
      </View>
      <ReferralList />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
});
