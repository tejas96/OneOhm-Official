import type { LeadDetail } from '@oneohm/api-contracts';
import {
  Button,
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
import { LEAD_SITE } from '@/copy/sales';

type Form = { address: string; city: string; district: string; pincode: string; consumer: string };

/**
 * The lead's site in a few fields, so a quotation can be saved from the field without
 * the office (PRD 4.5). The customer is matched by phone, never duplicated.
 */
export function LeadSiteSheet({
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
  const [form, setForm] = useState<Form>({
    address: '',
    city: lead.city,
    district: lead.city,
    pincode: '',
    consumer: '',
  });
  const set = (key: keyof Form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.crm.convertLead({
          params: { id: lead.id },
          body: {
            kind: lead.subsidyCategory === 'individual' ? 'individual' : 'organization',
            property: {
              label: LEAD_SITE.label[lead.subsidyCategory],
              addressLine: form.address,
              city: form.city,
              district: form.district,
              state: 'Maharashtra',
              pincode: form.pincode.trim() || null,
              subsidyCategory: lead.subsidyCategory,
              consumerNumber: form.consumer.trim() || null,
              floors: 1,
            },
          },
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['lead', lead.id] }),
        client.invalidateQueries({ queryKey: keys.leads }),
      ]);
      toast(LEAD_SITE.saved);
      onClose();
    },
  });
  const errors = fieldErrorsOf(save.error);
  const error = (field: string) => errors[`property.${field}`] ?? errors[field];
  const general = save.error && Object.keys(errors).length === 0 ? describeError(save.error) : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={LEAD_SITE.title}
      description={LEAD_SITE.description}
      closeLabel={COMMON.close}
      footer={
        <Button
          label={LEAD_SITE.save}
          size="lg"
          fullWidth
          pending={save.isPending}
          onPress={() => save.mutate()}
        />
      }
    >
      <Field label={LEAD_SITE.address} error={error('addressLine')}>
        <Input
          value={form.address}
          onChangeText={set('address')}
          placeholder={LEAD_SITE.addressPlaceholder}
          textContentType="fullStreetAddress"
          invalid={Boolean(error('addressLine'))}
          accessibilityLabel={LEAD_SITE.address}
        />
      </Field>
      <Field label={LEAD_SITE.city} error={error('city')}>
        <Input
          value={form.city}
          onChangeText={set('city')}
          autoCapitalize="words"
          invalid={Boolean(error('city'))}
          accessibilityLabel={LEAD_SITE.city}
        />
      </Field>
      <Field label={LEAD_SITE.district} error={error('district')}>
        <Input
          value={form.district}
          onChangeText={set('district')}
          autoCapitalize="words"
          invalid={Boolean(error('district'))}
          accessibilityLabel={LEAD_SITE.district}
        />
      </Field>
      <Field label={LEAD_SITE.pincode} optional={COMMON.optional} error={error('pincode')}>
        <Input
          value={form.pincode}
          onChangeText={set('pincode')}
          keyboardType="number-pad"
          maxLength={6}
          invalid={Boolean(error('pincode'))}
          accessibilityLabel={LEAD_SITE.pincode}
        />
      </Field>
      <Field
        label={LEAD_SITE.consumerNumber}
        hint={LEAD_SITE.consumerHint}
        optional={COMMON.optional}
        error={error('consumerNumber')}
      >
        <Input
          value={form.consumer}
          onChangeText={set('consumer')}
          invalid={Boolean(error('consumerNumber'))}
          accessibilityLabel={LEAD_SITE.consumerNumber}
        />
      </Field>
      {general ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {general}
        </Text>
      ) : null}
    </Sheet>
  );
}
