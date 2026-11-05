// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON data bindings are written as ${...}
/**
 * The self site survey form (WhatsApp Flow, redesign §7). Six screens: ROOF (roof type and floors),
 * four photo screens (one PhotoPicker each: Meta allows one per screen) and DETAILS (shade, roof size and,
 * only when the home has none, the consumer number). Every word comes from the start data of ROOF; the
 * other screens read it with global references (`${screen.ROOF.data.x}`). A PhotoPicker value cannot ride
 * in a navigate payload, so the last screen's `complete` payload reads each photo from its own screen
 * (`${screen.CORNER_A.form.photo}`). There is no data endpoint: the answers come back in the `nfm_reply`
 * webhook with our token. Change the JSON only with a new `version`. Unverified against Meta until the
 * flow is published (the publish script validates it first).
 */
export const SELF_SURVEY_VERSION = '1.0';
export const SURVEY_SCREEN = 'ROOF';

const text = (example: string) => ({ type: 'string', __example__: example });
const options = (example: string) => ({
  type: 'array',
  items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
  __example__: [{ id: 'a', title: example }],
});
const FORWARD = {
  shade_options: options('None'),
  size_options: options('Under 300 sq ft'),
  ask_consumer: { type: 'boolean', __example__: true },
};
const forward = Object.fromEntries(Object.keys(FORWARD).map((key) => [key, `\${data.${key}}`]));
const root = (key: string) => `\${screen.ROOF.data.${key}}`;

const radio = (name: string, label: string, source: string) => ({
  type: 'RadioButtonsGroup',
  name,
  label,
  required: true,
  'data-source': source,
});

const navigate = (label: string, next: string) => ({
  type: 'Footer',
  label,
  'on-click-action': { name: 'navigate', next: { type: 'screen', name: next }, payload: forward },
});

/** A screen with one camera/gallery photo, then on to the next. */
function photoScreen(id: string, next: string, heading: string, hint: string) {
  return {
    id,
    title: 'OneOhm',
    data: FORWARD,
    layout: {
      type: 'SingleColumnLayout',
      children: [
        { type: 'TextHeading', text: root(heading) },
        {
          type: 'Form',
          name: 'form',
          children: [
            {
              type: 'PhotoPicker',
              name: 'photo',
              label: root('photo_label'),
              description: root(hint),
              'photo-source': 'camera_gallery',
              'min-uploaded-photos': 1,
              'max-uploaded-photos': 1,
              'max-file-size-kb': 25600,
            },
            navigate(root('next'), next),
          ],
        },
      ],
    },
  };
}

const photo = (screen: string) => `\${screen.${screen}.form.photo}`;

export const SELF_SURVEY_FLOW = {
  version: '6.0',
  screens: [
    {
      id: SURVEY_SCREEN,
      title: 'OneOhm',
      data: {
        roof_heading: text('About your roof'),
        roof_label: text('Roof type'),
        floors_label: text('Floors'),
        next: text('Next'),
        photo_label: text('Photo'),
        corner_a_heading: text('Roof corner A'),
        corner_a_hint: text('Photograph one corner of the roof.'),
        corner_b_heading: text('Roof corner B'),
        corner_b_hint: text('Photograph the opposite corner.'),
        meter_heading: text('Electricity meter'),
        meter_hint: text('The meter number must be readable.'),
        board_heading: text('Main switch board'),
        board_hint: text('The board with the main switch.'),
        details_heading: text('Shade and size'),
        shade_label: text('Shade on the roof'),
        size_label: text('Roof size'),
        consumer_label: text('Consumer number'),
        consumer_hint: text('It is on your electricity bill'),
        send: text('Send survey'),
        roof_options: options('RCC'),
        floors_options: options('1 floor'),
        ...FORWARD,
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: '${data.roof_heading}' },
          {
            type: 'Form',
            name: 'form',
            children: [
              radio('roof', '${data.roof_label}', '${data.roof_options}'),
              radio('floors', '${data.floors_label}', '${data.floors_options}'),
              navigate('${data.next}', 'CORNER_A'),
            ],
          },
        ],
      },
    },
    photoScreen('CORNER_A', 'CORNER_B', 'corner_a_heading', 'corner_a_hint'),
    photoScreen('CORNER_B', 'METER', 'corner_b_heading', 'corner_b_hint'),
    photoScreen('METER', 'BOARD', 'meter_heading', 'meter_hint'),
    photoScreen('BOARD', 'DETAILS', 'board_heading', 'board_hint'),
    {
      id: 'DETAILS',
      title: 'OneOhm',
      terminal: true,
      data: FORWARD,
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: root('details_heading') },
          {
            type: 'Form',
            name: 'form',
            children: [
              radio('shade', root('shade_label'), '${data.shade_options}'),
              radio('size', root('size_label'), '${data.size_options}'),
              {
                type: 'TextInput',
                name: 'consumer',
                label: root('consumer_label'),
                'input-type': 'text',
                required: false,
                visible: '${data.ask_consumer}',
                'helper-text': root('consumer_hint'),
              },
              {
                type: 'Footer',
                label: root('send'),
                'on-click-action': {
                  name: 'complete',
                  payload: {
                    roof: '${screen.ROOF.form.roof}',
                    floors: '${screen.ROOF.form.floors}',
                    corner_a: photo('CORNER_A'),
                    corner_b: photo('CORNER_B'),
                    meter: photo('METER'),
                    board: photo('BOARD'),
                    shade: '${form.shade}',
                    size: '${form.size}',
                    consumer: '${form.consumer}',
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
