/** A reply inside WhatsApp's 24-hour window; the worker sends it like any message. */
export type ChatReply =
  | { readonly kind: 'text'; readonly body: string }
  | {
      readonly kind: 'document';
      readonly link: string;
      readonly filename: string;
      readonly caption?: string;
    }
  | {
      /** One message with a button that opens a web page (WhatsApp keeps the label to 20). */
      readonly kind: 'cta_url';
      readonly body: string;
      readonly label: string;
      readonly url: string;
    }
  | {
      /** A WhatsApp form (Flow) that opens on `screen` with `data`; `token` comes back with the reply. */
      readonly kind: 'flow';
      readonly body: string;
      /** The button that opens the form (WhatsApp keeps 30 characters). */
      readonly button: string;
      readonly flowId: string;
      readonly token: string;
      readonly screen: string;
      readonly data: Readonly<
        Record<string, string | boolean | readonly { id: string; title: string }[]>
      >;
      /** Said in plain words instead if the form cannot be delivered (the worker queues it). */
      readonly fallbackText?: string;
    }
  | {
      /** WhatsApp's own "📍 Send location" button; a single-button message (redesign §1, §6). */
      readonly kind: 'location_request';
      readonly body: string;
    }
  | {
      readonly kind: 'buttons';
      readonly body: string;
      readonly buttons: readonly { readonly id: string; readonly title: string }[];
    }
  | {
      readonly kind: 'list';
      readonly body: string;
      readonly button: string;
      /** The heading over the rows (WhatsApp keeps 24 characters); none when left out. */
      readonly section?: string;
      readonly rows: readonly {
        readonly id: string;
        readonly title: string;
        readonly description?: string;
      }[];
    };

/** The chat history's one-line text for a reply: its words, then any file or options. */
export function chatReplySummary(reply: ChatReply): string {
  if (reply.kind === 'text') return reply.body;
  if (reply.kind === 'document')
    return `${reply.caption ? `${reply.caption}\n` : ''}[${reply.filename}]`;
  if (reply.kind === 'cta_url') return `${reply.body}\n[${reply.label}]`;
  if (reply.kind === 'location_request') return `${reply.body}\n[📍 Send location]`;
  if (reply.kind === 'flow') return `${reply.body}\n[${reply.button}]`;
  const options =
    reply.kind === 'buttons'
      ? reply.buttons.map((button) => button.title)
      : reply.rows.map((row) => row.title);
  return `${reply.body}\n[${options.join(' · ')}]`;
}
