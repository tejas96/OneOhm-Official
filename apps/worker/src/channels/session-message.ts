/** A reply inside the 24-hour window after the customer wrote: no template needed. */
export type SessionMessage =
  | { readonly kind: 'text'; readonly body: string }
  | {
      readonly kind: 'buttons';
      readonly body: string;
      readonly buttons: readonly { readonly id: string; readonly title: string }[];
    }
  | {
      readonly kind: 'document';
      readonly link: string;
      readonly filename: string;
      readonly caption?: string;
    }
  | {
      readonly kind: 'cta_url';
      readonly body: string;
      /** Meta cuts the button label at 20 characters. */
      readonly label: string;
      readonly url: string;
    }
  | {
      /** A WhatsApp form that opens on `screen` with `data`; no data endpoint is called. */
      readonly kind: 'flow';
      readonly body: string;
      /** Meta cuts the button at 30 characters. */
      readonly button: string;
      readonly flowId: string;
      readonly token: string;
      readonly screen: string;
      readonly data: Readonly<Record<string, string>>;
      /** Sent as plain words if the form cannot be delivered; not part of the Meta message. */
      readonly fallbackText?: string;
    }
  | {
      readonly kind: 'list';
      readonly body: string;
      readonly button: string;
      /** The heading over the rows, such as the company's name; none when left out. */
      readonly section?: string;
      readonly rows: readonly {
        readonly id: string;
        readonly title: string;
        readonly description?: string;
      }[];
    };

/** Builds the Cloud API body for a text, file, link-button, reply-buttons or list message. */
export function sessionRequestBody(toE164: string, message: SessionMessage) {
  const to = toE164.replace(/^\+/, '');
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  if (message.kind === 'text')
    return { ...base, type: 'text', text: { preview_url: true, body: message.body } };
  if (message.kind === 'document')
    return {
      ...base,
      type: 'document',
      document: {
        link: message.link,
        filename: message.filename,
        ...(message.caption ? { caption: message.caption } : {}),
      },
    };
  if (message.kind === 'cta_url')
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: message.body },
        action: {
          name: 'cta_url',
          parameters: { display_text: message.label.slice(0, 20), url: message.url },
        },
      },
    };
  if (message.kind === 'flow')
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: message.body },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: message.token,
            flow_id: message.flowId,
            flow_cta: message.button.slice(0, 30),
            flow_action: 'navigate',
            flow_action_payload: { screen: message.screen, data: message.data },
          },
        },
      },
    };
  if (message.kind === 'buttons')
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: message.body },
        action: {
          buttons: message.buttons.map((button) => ({ type: 'reply', reply: button })),
        },
      },
    };
  return {
    ...base,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: message.body },
      action: {
        button: message.button,
        // One section needs no title (Meta's rule); a title is kept to 24 characters.
        sections: [
          message.section
            ? { title: message.section.slice(0, 24), rows: message.rows }
            : { rows: message.rows },
        ],
      },
    },
  };
}
