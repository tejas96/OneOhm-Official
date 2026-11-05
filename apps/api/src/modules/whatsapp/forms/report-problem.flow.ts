// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON data bindings are written as ${...}
/**
 * The problem report form (WhatsApp Flow, redesign §12), one screen: which home (shown only for 2 or more
 * homes), what is wrong, since when, up to 3 photos and an optional note. Every word and option comes
 * from the start data, so one published flow serves English, Marathi and Hindi. No data endpoint: Send
 * completes the flow and the answers come back in the `nfm_reply` webhook with our token. Change the JSON
 * only with a new `version`. Unverified against Meta until the flow is published (the publish script validates).
 */
export const REPORT_PROBLEM_VERSION = '1.0';
export const PROBLEM_SCREEN = 'PROBLEM';

const text = (example: string) => ({ type: 'string', __example__: example });
const options = (example: string) => ({
  type: 'array',
  items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
  __example__: [{ id: 'a', title: example }],
});

const radio = (name: string, label: string, source: string, visible?: string) => ({
  type: 'RadioButtonsGroup',
  name,
  label,
  required: !visible,
  'data-source': source,
  ...(visible ? { visible } : {}),
});

export const REPORT_PROBLEM_FLOW = {
  version: '6.0',
  screens: [
    {
      id: PROBLEM_SCREEN,
      title: 'OneOhm',
      terminal: true,
      data: {
        heading: text('Report a problem'),
        home_label: text('Which home?'),
        what_label: text('What is wrong?'),
        since_label: text('Since when?'),
        photos_label: text('Photos or videos'),
        photos_hint: text('Up to 3. They help us a lot.'),
        note_label: text('Anything to add?'),
        send: text('Send'),
        ask_home: { type: 'boolean', __example__: false },
        home_options: options('Sangli'),
        what_options: options('Inverter error'),
        since_options: options('Today'),
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: '${data.heading}' },
          {
            type: 'Form',
            name: 'form',
            children: [
              radio('home', '${data.home_label}', '${data.home_options}', '${data.ask_home}'),
              radio('what', '${data.what_label}', '${data.what_options}'),
              radio('since', '${data.since_label}', '${data.since_options}'),
              {
                type: 'PhotoPicker',
                name: 'photos',
                label: '${data.photos_label}',
                description: '${data.photos_hint}',
                'photo-source': 'camera_gallery',
                'min-uploaded-photos': 0,
                'max-uploaded-photos': 3,
                'max-file-size-kb': 25600,
              },
              {
                type: 'TextInput',
                name: 'note',
                label: '${data.note_label}',
                'input-type': 'text',
                required: false,
              },
              {
                type: 'Footer',
                label: '${data.send}',
                'on-click-action': {
                  name: 'complete',
                  payload: {
                    home: '${form.home}',
                    what: '${form.what}',
                    since: '${form.since}',
                    photos: '${form.photos}',
                    note: '${form.note}',
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
