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
import { defaultFollowUp, FollowUpDates } from './follow-up-dates';

const KINDS = ['call', 'visit', 'whatsapp', 'note'] as const;
type Kind = (typeof KINDS)[number];

/** Log what happened with a lead and when to come back to it, in one sheet. */
export function FollowUpSheet({
  leadId,
  open,
  onClose,
}: {
  readonly leadId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const theme = useTheme();
  const client = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('call');
  const [note, setNote] = useState('');
  const [next, setNext] = useState(defaultFollowUp());

  const save = useMutation({
    mutationFn: async () => {
      await unwrap(api.crm.addLeadActivity({ params: { id: leadId }, body: { kind, note } }));
      return unwrap(api.crm.updateLead({ params: { id: leadId }, body: { nextActionOn: next } }));
    },
    onSuccess: async (lead) => {
      client.setQueryData(['lead', leadId], lead);
      await client.invalidateQueries({ queryKey: keys.leads });
      toast(LEAD.logged);
      setNote('');
      onClose();
    },
  });
  const errors = fieldErrorsOf(save.error);

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
          onPress={() => save.mutate()}
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
          onChangeText={setNote}
          placeholder={LEAD.sheet.notePlaceholder}
          multiline
          invalid={Boolean(errors.note)}
          accessibilityLabel={LEAD.sheet.note}
        />
      </Field>
      <Field label={LEAD.sheet.next}>
        <FollowUpDates label={LEAD.sheet.next} value={next} onChange={setNext} />
      </Field>
      {save.error && Object.keys(errors).length === 0 ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {describeError(save.error)}
        </Text>
      ) : null}
    </Sheet>
  );
}
