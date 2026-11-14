// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON data bindings are written as ${...}
/**
 * The new-lead onboarding form (WhatsApp Flow, Part 1 §3), one screen: name, city (with an optional typed
 * "other city"), site type, monthly bill, roof, floors and an optional photo of the electricity bill. Every
 * word and option comes from the start data, so one published flow serves English, Marathi and Hindi. No
 * data endpoint: Send completes the flow and the answers come back in the `nfm_reply` webhook with our
 * token. The "other city" field is always shown (optional), because a `visible` rule on a form value is
 * not used by the other forms. Change the JSON only with a new `version`.
 */
export const ONBOARDING_FORM_VERSION = '1.0';
export const ONBOARDING_SCREEN = 'ABOUT_YOU';
/** The city option that means "type it below". */
export const OTHER_CITY_OPTION = '__other__';

const text = (example: string) => ({ type: 'string', __example__: example });
const options = (example: string) => ({
  type: 'array',
  items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
  __example__: [{ id: 'a', title: example }],
});

const radio = (name: string, label: string, source: string) => ({
  type: 'RadioButtonsGroup',
  name,
  label,
  required: true,
  'data-source': source,
});

export const ONBOARDING_FLOW = {
  version: '6.0',
  screens: [
    {
      id: ONBOARDING_SCREEN,
      title: 'OneOhm',
      terminal: true,
      data: {
        heading: text('Tell us about your home'),
        name_label: text('Your name'),
        name_init: text('Asha Patil'),
        city_label: text('Which city?'),
        other_city_label: text('Other city'),
        other_city_hint: text('Only if your city is not in the list'),
        site_label: text('Where do you want solar?'),
        bill_label: text('Monthly electricity bill'),
        roof_label: text('What is the roof like?'),
        floors_label: text('How many floors?'),
        photo_label: text('Photo of your bill'),
        photo_hint: text('Optional. Or send a PDF in the chat after.'),
        send: text('Get my estimate'),
        city_options: options('Pune'),
        site_options: options('Home'),
        bill_options: options('Up to ₹1,000'),
        roof_options: options('RCC slab'),
        floors_options: options('Ground only'),
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: '${data.heading}' },
          {
            type: 'Form',
            name: 'form',
            // Flow JSON 6.0 sets starting values on the form, not on a field.
            'init-values': { name: '${data.name_init}' },
            children: [
              {
                type: 'TextInput',
                name: 'name',
                label: '${data.name_label}',
                'input-type': 'text',
                required: true,
              },
              radio('city', '${data.city_label}', '${data.city_options}'),
              {
                type: 'TextInput',
                name: 'other_city',
                label: '${data.other_city_label}',
                'helper-text': '${data.other_city_hint}',
                'input-type': 'text',
                required: false,
              },
              radio('site', '${data.site_label}', '${data.site_options}'),
              radio('bill', '${data.bill_label}', '${data.bill_options}'),
              radio('roof', '${data.roof_label}', '${data.roof_options}'),
              radio('floors', '${data.floors_label}', '${data.floors_options}'),
              {
                type: 'PhotoPicker',
                name: 'bill_photo',
                label: '${data.photo_label}',
                description: '${data.photo_hint}',
                'photo-source': 'camera_gallery',
                'min-uploaded-photos': 0,
                'max-uploaded-photos': 1,
                'max-file-size-kb': 25600,
              },
              {
                type: 'Footer',
                label: '${data.send}',
                'on-click-action': {
                  name: 'complete',
                  payload: {
                    name: '${form.name}',
                    city: '${form.city}',
                    other_city: '${form.other_city}',
                    site: '${form.site}',
                    bill: '${form.bill}',
                    roof: '${form.roof}',
                    floors: '${form.floors}',
                    bill_photo: '${form.bill_photo}',
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
