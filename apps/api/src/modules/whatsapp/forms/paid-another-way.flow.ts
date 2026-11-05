// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON data bindings are written as ${...}
/**
 * The "I paid another way" form (WhatsApp Flow), one screen: the amount, the day and a photo of
 * the proof (camera or gallery). Every word comes from the start data (`paidAnotherWayData`), so
 * one published flow serves English, Marathi and Hindi. There is no data endpoint: Send completes
 * the flow and the values come back in the `nfm_reply` webhook, with our token. A TextInput and a
 * DatePicker can only be pre-filled outside a Form, so the amount due rides in the hint instead and an
 * empty amount means "the amount due". Change the JSON only with a new `version`.
 */
export const PAID_ANOTHER_WAY_VERSION = '1.0';
export const PAID_SCREEN = 'PAID';

const text = (example: string) => ({ type: 'string', __example__: example });

export const PAID_ANOTHER_WAY_FLOW = {
  version: '6.0',
  screens: [
    {
      id: PAID_SCREEN,
      title: 'OneOhm',
      terminal: true,
      data: {
        heading: text('₹45,000 — Sangli'),
        amount_label: text('Amount paid (₹)'),
        amount_hint: text('Amount due: ₹45,000'),
        date_label: text('Date paid'),
        photos_label: text('Proof of payment'),
        photos_hint: text('A screenshot or a photo of the receipt.'),
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
                name: 'amount',
                label: '${data.amount_label}',
                'input-type': 'number',
                required: true,
                'helper-text': '${data.amount_hint}',
              },
              {
                type: 'DatePicker',
                name: 'date',
                label: '${data.date_label}',
                required: true,
              },
              {
                type: 'PhotoPicker',
                name: 'photos',
                label: '${data.photos_label}',
                description: '${data.photos_hint}',
                'photo-source': 'camera_gallery',
                'min-uploaded-photos': 1,
                'max-uploaded-photos': 2,
                'max-file-size-kb': 25600,
              },
              {
                type: 'Footer',
                label: '${data.send}',
                'on-click-action': {
                  name: 'complete',
                  payload: {
                    amount: '${form.amount}',
                    date: '${form.date}',
                    photos: '${form.photos}',
                  },
                },
              },
            ],
          },
        ],
      },
    },
  ],
};
