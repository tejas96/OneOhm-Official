import type { QuotationInput } from '@oneohm/api-contracts';
import { Button, describeError, Text, useTheme } from '@oneohm/mobile-ui';
import { Save, Send } from 'lucide-react-native';
import { QUOTE } from '@/copy/quote';
import type { SaveQuote } from './use-save-quote';

/**
 * The quote's one next step, pinned to the bottom: save it (again, as a new revision,
 * after a change), then send it to the customer once nothing waits for approval.
 * Shown to people who create quotations, once the form has a price.
 */
export function QuoteFooter({
  input,
  quote,
}: {
  /** Null while the site is not on record: only a property's quote can be saved. */
  readonly input: QuotationInput | null;
  readonly quote: SaveQuote;
}) {
  const theme = useTheme();
  const failure = quote.save.error ?? quote.send.error;
  const error = failure ? (
    <Text variant="bodySm" color={theme.status.overdue.fg}>
      {describeError(failure)}
    </Text>
  ) : null;
  if (!input) {
    return (
      <Text variant="bodySm" tone="secondary">
        {QUOTE.save.needsSite}
      </Text>
    );
  }
  const quotation = quote.quotation;
  if (!quotation || quote.changed) {
    return (
      <>
        {error}
        <Button
          label={quotation ? QUOTE.save.saveChanges : QUOTE.save.save}
          size="lg"
          fullWidth
          icon={<Save size={18} color={theme.colors.onAccent} />}
          pending={quote.save.isPending}
          onPress={() => quote.save.mutate(input)}
        />
      </>
    );
  }
  if (quotation.status !== 'draft' && quotation.status !== 'sent') return null;
  const waiting = quotation.discountPendingApproval;
  const note = waiting
    ? QUOTE.saved.waitingNote
    : quotation.status === 'sent'
      ? QUOTE.saved.sentNote
      : QUOTE.saved.sendNote(quotation.customerPhone);
  return (
    <>
      {error}
      <Button
        label={quotation.status === 'sent' ? QUOTE.saved.sendAgain : QUOTE.saved.send}
        size="lg"
        fullWidth
        variant={quotation.status === 'sent' ? 'secondary' : 'primary'}
        icon={
          <Send
            size={18}
            color={quotation.status === 'sent' ? theme.colors.textPrimary : theme.colors.onAccent}
          />
        }
        disabled={waiting}
        pending={quote.send.isPending}
        onPress={() => quote.send.mutate(quotation.id)}
      />
      <Text variant="label" tone="tertiary">
        {note}
      </Text>
    </>
  );
}
