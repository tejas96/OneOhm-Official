import type { LeadDetail } from '@oneohm/api-contracts';
import { defaultDiscomId } from '@oneohm/domain';
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
import { DiscomPicker } from '@/features/discom/discom-picker';
import { offeredDiscoms, useDiscoms } from '@/features/discom/use-discoms';
import { type Checks, passes, withoutKeys } from '@/lib/form';

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
  const [checks, setChecks] = useState<Checks>({});
  const set = (key: keyof Form, field: string) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setChecks((current) => withoutKeys(current, field));
  };
  // The DISCOM on the bill; with a single active DISCOM it starts picked, to confirm.
  const discoms = useDiscoms();
  const [pickedDiscom, setDiscom] = useState<string | null>(null);
  const discomId = pickedDiscom ?? defaultDiscomId(discoms.data ?? [], null);

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.crm.convertLead({
          params: { id: lead.id },
          body: {
            kind: lead.subsidyCategory === 'individual' ? 'individual' : 'organization',
            property: {
              label: LEAD_SITE.label[lead.subsidyCategory],
              addressLine: form.address.trim(),
              city: form.city.trim(),
              district: form.district.trim(),
              state: 'Maharashtra',
              pincode: form.pincode.trim() || null,
              subsidyCategory: lead.subsidyCategory,
              consumerNumber: form.consumer.trim() || null,
              discomId,
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
  const error = (field: string) => checks[field] ?? errors[`property.${field}`] ?? errors[field];
  const general = save.error ? describeError(save.error) : null;
  // Fields this sheet fills in for the person: their messages show with the sentence.
  const hidden = [errors.property, error('label'), error('state'), error('floors')].filter(
    (message): message is string => Boolean(message),
  );

  const submit = () => {
    if (save.isPending) return;
    const found: Record<string, string> = {};
    if (form.address.trim().length < 3) found.addressLine = LEAD_SITE.addressRequired;
    if (form.city.trim().length < 2) found.city = LEAD_SITE.cityRequired;
    if (form.district.trim().length < 2) found.district = LEAD_SITE.districtRequired;
    if (form.pincode.trim() && !/^\d{6}$/.test(form.pincode.trim()))
      found.pincode = LEAD_SITE.pincodeInvalid;
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
      title={LEAD_SITE.title}
      description={LEAD_SITE.description}
      closeLabel={COMMON.close}
      footer={
        <Button
          label={LEAD_SITE.save}
          size="lg"
          fullWidth
          pending={save.isPending}
          onPress={submit}
        />
      }
    >
      <Field label={LEAD_SITE.address} error={error('addressLine')}>
        <Input
          value={form.address}
          onChangeText={set('address', 'addressLine')}
          maxLength={400}
          placeholder={LEAD_SITE.addressPlaceholder}
          textContentType="fullStreetAddress"
          invalid={Boolean(error('addressLine'))}
          accessibilityLabel={LEAD_SITE.address}
        />
      </Field>
      <Field label={LEAD_SITE.city} error={error('city')}>
        <Input
          value={form.city}
          onChangeText={set('city', 'city')}
          maxLength={80}
          autoCapitalize="words"
          invalid={Boolean(error('city'))}
          accessibilityLabel={LEAD_SITE.city}
        />
      </Field>
      <Field label={LEAD_SITE.district} error={error('district')}>
        <Input
          value={form.district}
          onChangeText={set('district', 'district')}
          maxLength={80}
          autoCapitalize="words"
          invalid={Boolean(error('district'))}
          accessibilityLabel={LEAD_SITE.district}
        />
      </Field>
      <Field label={LEAD_SITE.pincode} optional={COMMON.optional} error={error('pincode')}>
        <Input
          value={form.pincode}
          onChangeText={set('pincode', 'pincode')}
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
          onChangeText={set('consumer', 'consumerNumber')}
          maxLength={40}
          invalid={Boolean(error('consumerNumber'))}
          accessibilityLabel={LEAD_SITE.consumerNumber}
        />
      </Field>
      {discoms.data ? (
        <DiscomPicker
          discoms={offeredDiscoms(discoms.data, null)}
          value={discomId}
          onChange={setDiscom}
          optional={COMMON.optional}
          error={error('discomId')}
        />
      ) : null}
      {general ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {general}
        </Text>
      ) : null}
      {hidden.map((message) => (
        <Text key={message} variant="bodySm" color={theme.status.overdue.fg}>
          {message}
        </Text>
      ))}
    </Sheet>
  );
}
