// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON data bindings are written as ${...}
/**
 * The "Send a paper" form (WhatsApp Flow): one screen with a heading, one picker for up to
 * four photos or PDFs, and Send. Every word comes from the start data (`FormWords`), so one
 * published flow serves English, Marathi and Hindi. The flow has no data endpoint: the
 * message starts it on this screen with the words, and Send completes it, so the files come
 * back in the `nfm_reply` webhook. Change the JSON only with a new `version`; the publish
 * script uploads whatever is here (see `forms:publish`).
 *
 * Meta limits (Flow JSON 6.0): DocumentPicker needs 4.0+, one picker per screen, label 80
 * and description 300 characters, 1 to 30 files; the reply carries at most 10.
 */
export const SEND_PAPER_VERSION = '1.0';

/** The photo and paper types we can keep (see WHATSAPP_FILE_TYPES). */
export const SEND_PAPER_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

export const SEND_PAPER_SCREEN = 'SEND_PAPER';

export const SEND_PAPER_FLOW = {
  version: '6.0',
  screens: [
    {
      id: SEND_PAPER_SCREEN,
      title: 'OneOhm',
      terminal: true,
      data: {
        heading: { type: 'string', __example__: 'Electricity bill — Sangli' },
        hint: { type: 'string', __example__: 'Add up to 4 photos or a PDF.' },
        label: { type: 'string', __example__: 'Photos or PDF' },
        send: { type: 'string', __example__: 'Send' },
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
                type: 'DocumentPicker',
                name: 'files',
                label: '${data.label}',
                description: '${data.hint}',
                'min-uploaded-documents': 1,
                'max-uploaded-documents': 4,
                'allowed-mime-types': [...SEND_PAPER_MIME_TYPES],
              },
              {
                type: 'Footer',
                label: '${data.send}',
                'on-click-action': {
                  name: 'complete',
                  payload: { files: '${form.files}' },
                },
              },
            ],
          },
        ],
      },
    },
  ],
};
