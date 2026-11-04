import type { PayoutDetailsView } from '@oneohm/api-contracts';
import {
  checkPayoutDraft,
  type PayoutDraft,
  type PayoutField,
  type PayoutMethod,
  payoutDraftFrom,
  payoutFieldsFor,
  payoutPayloadOf,
} from '@oneohm/domain';
import {
  Button,
  ChoiceChips,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Sheet,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { useEffect, useState } from 'react';
import type { TextInputProps } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useToast } from '@/components/toast';
import { COMMON } from '@/copy/common';
import { PAYOUT } from '@/copy/reseller';
import { useCurrentUser } from '@/session/session-provider';
import { useSavePayoutDetails } from '../reseller/use-reseller';

const METHODS: readonly PayoutMethod[] = ['upi', 'bank'];
const UPPER: ReadonlySet<PayoutField> = new Set(['pan', 'bankIfsc']);
const missing = (field: PayoutField) => PAYOUT.missing[field];

/** Keyboard and look for each box, so the phone offers the right keys. */
const INPUT: Readonly<Record<PayoutField, TextInputProps & { mono?: boolean }>> = {
  upiId: { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'off' },
  bankAccountName: { autoCapitalize: 'words', autoComplete: 'name' },
  bankAccountNumber: { keyboardType: 'number-pad', maxLength: 18, mono: true },
  bankIfsc: { autoCapitalize: 'characters', maxLength: 11, mono: true },
  pan: { autoCapitalize: 'characters', maxLength: 10, mono: true },
};

const HINT: Partial<Record<PayoutField, string>> = {
  upiId: PAYOUT.upiHint,
  bankIfsc: PAYOUT.ifscHint,
  pan: PAYOUT.panHint,
};

/**
 * One job: say where to send the commission. UPI or a bank account (only that way's boxes
 * show), then PAN. Masked saved values stay as they are unless a new one is typed.
 */
export function PayoutDetailsSheet({
  open,
  saved,
  onClose,
}: {
  readonly open: boolean;
  readonly saved: PayoutDetailsView | null;
  readonly onClose: () => void;
}) {
  const theme = useTheme();
  const toast = useToast();
  const user = useCurrentUser();
  const save = useSavePayoutDetails(user.id);
  const [draft, setDraft] = useState<PayoutDraft>(() => payoutDraftFrom(saved));
  const [checked, setChecked] = useState(false);
  const { reset } = save;

  // Each opening starts from what is saved now.
  useEffect(() => {
    if (!open) return;
    setDraft(payoutDraftFrom(saved));
    setChecked(false);
    reset();
  }, [open, saved, reset]);

  const problems = checked ? checkPayoutDraft(draft, missing) : {};
  const serverErrors = save.error ? fieldErrorsOf(save.error) : {};
  const setValue = (field: PayoutField, text: string) =>
    setDraft((current) => ({
      ...current,
      values: { ...current.values, [field]: UPPER.has(field) ? text.toUpperCase() : text },
    }));

  const submit = () => {
    setChecked(true);
    if (save.isPending || Object.keys(checkPayoutDraft(draft, missing)).length > 0) return;
    save.mutate(payoutPayloadOf(draft), {
      onSuccess: () => {
        toast(PAYOUT.saved);
        onClose();
      },
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={PAYOUT.title}
      description={PAYOUT.sheetDescription}
      closeLabel={COMMON.close}
      footer={<Button label={PAYOUT.save} onPress={submit} pending={save.isPending} fullWidth />}
    >
      <View style={styles.form}>
        <ChoiceChips
          kind="segmented"
          label={PAYOUT.methodLabel}
          value={draft.method}
          onChange={(method) => setDraft((current) => ({ ...current, method }))}
          choices={METHODS.map((value) => ({ value, label: PAYOUT.methods[value] }))}
        />
        {payoutFieldsFor(draft.method).map((field) => {
          const { mono, ...input } = INPUT[field];
          const kept = draft.kept[field];
          const error = problems[field] ?? serverErrors[field];
          return (
            <Field
              key={field}
              label={PAYOUT[field]}
              hint={kept ? PAYOUT.keepHint : HINT[field]}
              error={error}
            >
              <Input
                {...input}
                mono={mono ?? false}
                value={draft.values[field]}
                onChangeText={(text) => setValue(field, text)}
                placeholder={kept}
                autoCorrect={false}
                invalid={Boolean(error)}
                accessibilityLabel={PAYOUT[field]}
              />
            </Field>
          );
        })}
        {save.error ? (
          <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
            {describeError(save.error)}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
});
