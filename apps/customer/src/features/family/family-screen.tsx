import type { FamilyMember } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Screen,
  Text,
  unwrap,
} from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { FormAlert } from '@/components/form-alert';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { COMMON } from '@/copy/common';
import { FAMILY } from '@/copy/family';
import { confirmAction } from '@/lib/confirm';
import { indianMobile } from '@/lib/phone';
import { useCustomer } from '@/session/session-provider';

const KEY = ['customer', 'family'] as const;

/** Who else can see this customer's projects; only the account holder changes it. */
export function FamilyScreen() {
  const customer = useCustomer();
  const viewer = customer.viewer ?? null;
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.customerFamily.listFamily()) });
  return (
    <Screen>
      <ScreenHeader title={FAMILY.title} />
      <Text variant="body" tone="secondary">
        {viewer ? FAMILY.viewerIntro(customer.name) : FAMILY.intro}
      </Text>
      <Card style={styles.card}>
        {(query.data ?? []).length === 0 ? (
          <Text variant="body" tone="secondary">
            {FAMILY.empty}
          </Text>
        ) : (
          (query.data ?? []).map((member) => (
            <MemberRow key={member.id} member={member} canRemove={!viewer} />
          ))
        )}
      </Card>
      {viewer ? null : <AddMember />}
    </Screen>
  );
}

function MemberRow({
  member,
  canRemove,
}: {
  readonly member: FamilyMember;
  readonly canRemove: boolean;
}) {
  const client = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: () =>
      unwrap(api.customerFamily.removeFamily({ params: { id: member.id }, body: {} })),
    onSuccess: (list) => {
      client.setQueryData(KEY, list);
      toast(FAMILY.removed(member.name));
    },
  });
  const ask = () =>
    confirmAction({
      title: FAMILY.removeAsk(member.name),
      message: FAMILY.removeAskBody(member.name),
      confirm: FAMILY.remove,
      cancel: COMMON.cancel,
      onConfirm: () => remove.mutate(),
    });
  return (
    <View style={styles.member}>
      <View style={styles.row}>
        <View style={styles.fill}>
          <Text variant="body">{member.name}</Text>
          <Text variant="label" tone="tertiary">
            {[member.relation, member.phone].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {canRemove ? (
          <Button
            size="sm"
            variant="quiet"
            label={FAMILY.remove}
            accessibilityHint={FAMILY.removeLabel(member.name)}
            pending={remove.isPending}
            onPress={ask}
          />
        ) : null}
      </View>
      <FormAlert message={remove.error ? describeError(remove.error) : null} />
    </View>
  );
}

type AddField = 'name' | 'phone' | 'relation';

function AddMember() {
  const client = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [checked, setChecked] = useState<Partial<Record<AddField, string | undefined>>>({});
  const add = useMutation({
    mutationFn: (body: { name: string; phone: string; relation: string }) =>
      unwrap(api.customerFamily.addFamily({ body })),
    onSuccess: (list, body) => {
      client.setQueryData(KEY, list);
      toast(FAMILY.added(body.name));
      setName('');
      setPhone('');
      setRelation('');
    },
  });
  const server = add.error ? fieldErrorsOf(add.error) : {};
  const errorOf = (field: AddField) => checked[field] ?? server[field];
  const submit = () => {
    const mobile = indianMobile(phone);
    const found: Partial<Record<AddField, string | undefined>> = {};
    if (!name.trim()) found.name = COMMON.required;
    else if (name.trim().length < 2) found.name = COMMON.nameShort;
    if (!phone.trim()) found.phone = COMMON.required;
    else if (!mobile) found.phone = COMMON.phoneInvalid;
    setChecked(found);
    if (Object.keys(found).length > 0 || !mobile) {
      add.reset();
      return;
    }
    add.mutate({ name: name.trim(), phone: mobile, relation: relation.trim() });
  };
  const change = (field: AddField, set: (value: string) => void) => (value: string) => {
    set(value);
    if (checked[field]) setChecked((current) => ({ ...current, [field]: undefined }));
  };
  return (
    <Card style={styles.card}>
      <Text variant="titleMd">{FAMILY.addTitle}</Text>
      <Field label={FAMILY.name} error={errorOf('name')}>
        <Input
          value={name}
          onChangeText={change('name', setName)}
          accessibilityLabel={FAMILY.name}
          autoComplete="name"
          maxLength={160}
          invalid={Boolean(errorOf('name'))}
        />
      </Field>
      <Field label={FAMILY.phone} error={errorOf('phone')}>
        <Input
          value={phone}
          onChangeText={change('phone', setPhone)}
          keyboardType="phone-pad"
          autoComplete="tel"
          accessibilityLabel={FAMILY.phone}
          maxLength={16}
          invalid={Boolean(errorOf('phone'))}
        />
      </Field>
      <Field label={FAMILY.relation} hint={FAMILY.relationHint} error={errorOf('relation')}>
        <Input
          value={relation}
          onChangeText={change('relation', setRelation)}
          accessibilityLabel={FAMILY.relation}
          maxLength={40}
          invalid={Boolean(errorOf('relation'))}
        />
      </Field>
      <FormAlert message={add.error ? describeError(add.error) : null} />
      <Button label={FAMILY.add} onPress={submit} pending={add.isPending} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  member: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  fill: { flex: 1, gap: 2 },
});
