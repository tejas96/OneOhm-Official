import type { FamilyMember } from '@oneohm/api-contracts';
import { Button, Card, describeError, Field, Input, Screen, Text, unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { FormAlert } from '@/components/form-alert';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { FAMILY } from '@/copy/family';
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
    onError: () => toast(FAMILY.failed),
  });
  return (
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
          onPress={() => remove.mutate()}
        />
      ) : null}
    </View>
  );
}

function AddMember() {
  const client = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const add = useMutation({
    mutationFn: () =>
      unwrap(api.customerFamily.addFamily({ body: { name: name.trim(), phone, relation } })),
    onSuccess: (list) => {
      client.setQueryData(KEY, list);
      toast(FAMILY.added(name.trim()));
      setName('');
      setPhone('');
      setRelation('');
    },
  });
  return (
    <Card style={styles.card}>
      <Text variant="titleMd">{FAMILY.addTitle}</Text>
      <Field label={FAMILY.name}>
        <Input value={name} onChangeText={setName} accessibilityLabel={FAMILY.name} />
      </Field>
      <Field label={FAMILY.phone}>
        <Input
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          accessibilityLabel={FAMILY.phone}
        />
      </Field>
      <Field label={FAMILY.relation} hint={FAMILY.relationHint}>
        <Input value={relation} onChangeText={setRelation} accessibilityLabel={FAMILY.relation} />
      </Field>
      <FormAlert message={add.error ? describeError(add.error) : null} />
      <Button
        label={FAMILY.add}
        onPress={() => add.mutate()}
        pending={add.isPending}
        disabled={name.trim().length < 2 || phone.replace(/\D/g, '').length < 10}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  fill: { flex: 1, gap: 2 },
});
