// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON data bindings are written as ${...}
/**
 * The "Share your UPI ID" form (WhatsApp Flow, redesign §15), one screen with one text field. The words come
 * from the start data. Change the JSON only with a new `version`.
 */
export const SHARE_UPI_VERSION = '1.0';
export const UPI_SCREEN = 'UPI';

const text = (example: string) => ({ type: 'string', __example__: example });

export const SHARE_UPI_FLOW = {
  version: '6.0',
  screens: [
    {
      id: UPI_SCREEN,
      title: 'OneOhm',
      terminal: true,
      data: {
        heading: text('Your UPI ID'),
        upi_label: text('UPI ID'),
        upi_hint: text('For example name@bank'),
        send: text('Send'),
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: '${data.heading}' },
          {
            type: 'Form',
            name: 'form',
            children: [
              {
                type: 'TextInput',
                name: 'upi',
                label: '${data.upi_label}',
                'input-type': 'text',
                required: true,
                'helper-text': '${data.upi_hint}',
              },
              {
                type: 'Footer',
                label: '${data.send}',
                'on-click-action': { name: 'complete', payload: { upi: '${form.upi}' } },
              },
            ],
          },
        ],
      },
    },
  ],
};
