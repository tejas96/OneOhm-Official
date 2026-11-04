// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON data bindings are written as ${...}
/**
 * The "Send a paper" form (WhatsApp Flow): two screens. SEND_PAPER takes up to four photos
 * (camera or gallery) with Send, and a link "Have a PDF instead?" to SEND_PDF, which takes up to
 * two PDFs. Every word comes from the start data (`FormWords`), so one
 * published flow serves English, Marathi and Hindi. The flow has no data endpoint: the
 * message starts it on this screen with the words, and Send completes it, so the files come
 * back in the `nfm_reply` webhook. Change the JSON only with a new `version`; the publish
 * script uploads whatever is here (see `forms:publish`).
 *
 * Meta limits (Flow JSON 6.0): pickers need 4.0+, one picker per screen (so photos and PDFs are
 * two screens), label 80 and description 300 characters, 1 to 30 files; a reply carries at most 10.
 * A picker's files cannot travel in a navigate action, so each screen completes by itself.
 */
export const SEND_PAPER_VERSION = '2.0';

/** The PDF screen takes PDFs only; photos come from the camera or gallery picker. */
export const SEND_PDF_MIME_TYPES = ['application/pdf'] as const;

export const SEND_PAPER_SCREEN = 'SEND_PAPER';
export const SEND_PDF_SCREEN = 'SEND_PDF';

const text = (example: string) => ({ type: 'string', __example__: example });

export const SEND_PAPER_FLOW = {
  version: '6.0',
  screens: [
    {
      id: SEND_PAPER_SCREEN,
      title: 'OneOhm',
      terminal: true,
      data: {
        heading: text('Electricity bill — Sangli'),
        photos_label: text('Photos'),
        photos_hint: text('Add up to 4 photos.'),
        send: text('Send'),
        pdf_link: text('Have a PDF instead?'),
        pdf_label: text('PDF'),
        pdf_hint: text('Add up to 2 PDFs.'),
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
                type: 'PhotoPicker',
                name: 'photos',
                label: '${data.photos_label}',
                description: '${data.photos_hint}',
                'photo-source': 'camera_gallery',
                'min-uploaded-photos': 1,
                'max-uploaded-photos': 4,
                'max-file-size-kb': 25600,
              },
              {
                type: 'EmbeddedLink',
                text: '${data.pdf_link}',
                'on-click-action': {
                  name: 'navigate',
                  next: { type: 'screen', name: SEND_PDF_SCREEN },
                  payload: {
                    heading: '${data.heading}',
                    pdf_label: '${data.pdf_label}',
                    pdf_hint: '${data.pdf_hint}',
                    send: '${data.send}',
                  },
                },
              },
              {
                type: 'Footer',
                label: '${data.send}',
                'on-click-action': { name: 'complete', payload: { photos: '${form.photos}' } },
              },
            ],
          },
        ],
      },
    },
    {
      id: SEND_PDF_SCREEN,
      title: 'OneOhm',
      terminal: true,
      data: {
        heading: text('Electricity bill — Sangli'),
        pdf_label: text('PDF'),
        pdf_hint: text('Add up to 2 PDFs.'),
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
                type: 'DocumentPicker',
                name: 'pdfs',
                label: '${data.pdf_label}',
                description: '${data.pdf_hint}',
                'min-uploaded-documents': 1,
                'max-uploaded-documents': 2,
                'max-file-size-kb': 25600,
                'allowed-mime-types': [...SEND_PDF_MIME_TYPES],
              },
              {
                type: 'Footer',
                label: '${data.send}',
                'on-click-action': { name: 'complete', payload: { pdfs: '${form.pdfs}' } },
              },
            ],
          },
        ],
      },
    },
  ],
};
