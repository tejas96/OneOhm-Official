import { type MetaTools, PlatformError } from '@oneohm/marketing';

/** A send with no answer: Meta may have it already, so it is never sent again on its own. */
export const SOCIAL_MAYBE_SENT =
  'Meta did not answer in time: this reply may have been sent. Check Instagram or Messenger before sending it again.';

/** The Graph call timed out or dropped before any answer (not an HTTP refusal). */
const noAnswer = (error: PlatformError): boolean =>
  error.kind === 'temporary' && error.detail === 'network or timeout';

export type SocialResult =
  | { readonly status: 'sent'; readonly messageId: string }
  | { readonly status: 'failed'; readonly reason: string };

/**
 * One queued Instagram or Messenger reply, sent through Meta. A refusal that waiting will not fix
 * ends as failed with its plain words; a timeout is "maybe sent" and fails too (no duplicate reply); other temporary ones are thrown so
 * Temporal tries again.
 */
export async function sendSocialMessage(
  tools: MetaTools | null,
  row: { readonly channel: string; readonly recipient: string; readonly payload: unknown },
): Promise<SocialResult> {
  if (!tools) return { status: 'failed', reason: 'Meta is not connected.' };
  if (row.channel !== 'instagram' && row.channel !== 'messenger')
    return { status: 'failed', reason: `The ${row.channel} channel is not a Meta chat.` };
  const payload = (row.payload ?? {}) as {
    body?: string;
    commentId?: string;
    recipientId?: string;
  };
  if (!payload.body) return { status: 'failed', reason: 'No message text was written.' };
  const commentId = payload.commentId ?? null;
  try {
    const sent = await tools.sendMessage({
      channel: row.channel,
      // The chat keeps the person as `ig:<id>` / `fb:<id>`; Meta wants the bare id.
      recipientId: commentId
        ? null
        : (payload.recipientId ?? row.recipient.replace(/^(ig|fb):/, '')),
      commentId,
      text: payload.body,
    });
    return { status: 'sent', messageId: sent.messageId };
  } catch (error) {
    if (error instanceof PlatformError && noAnswer(error))
      return { status: 'failed', reason: SOCIAL_MAYBE_SENT };
    if (error instanceof PlatformError && !error.retryable)
      return { status: 'failed', reason: error.message };
    throw error;
  }
}
