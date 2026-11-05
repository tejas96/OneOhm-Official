// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON data bindings are written as ${...}
/**
 * The refer-a-friend form (WhatsApp Flow, redesign §15), one screen: the friend's name, mobile number and
 * city (a tap from the service cities). Words and cities come from the start data. Change the JSON only
 * with a new `version`.
 */
export const REFER_FRIEND_VERSION = '1.0';
export const REFER_SCREEN = 'REFER';

const text = (example: string) => ({ type: 'string', __example__: example });

export const REFER_FRIEND_FLOW = {
  version: '6.0',
  screens: [
    {
      id: REFER_SCREEN,
      title: 'OneOhm',
      terminal: true,
      data: {
        heading: text('Refer a friend'),
        name_label: text("Friend's name"),
        mobile_label: text('Mobile number'),
        mobile_hint: text('10 digits'),
        city_label: text('City'),
        send: text('Send'),
        city_options: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, title: { type: 'string' } },
          },
          __example__: [{ id: 'Sangli', title: 'Sangli' }],
        },
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
                name: 'friend',
                label: '${data.name_label}',
                'input-type': 'text',
                required: true,
              },
              {
                type: 'TextInput',
                name: 'mobile',
                label: '${data.mobile_label}',
                'input-type': 'phone',
                required: true,
                'helper-text': '${data.mobile_hint}',
              },
              {
                type: 'RadioButtonsGroup',
                name: 'city',
                label: '${data.city_label}',
                required: true,
                'data-source': '${data.city_options}',
              },
              {
                type: 'Footer',
                label: '${data.send}',
                'on-click-action': {
                  name: 'complete',
                  payload: {
                    friend: '${form.friend}',
                    mobile: '${form.mobile}',
                    city: '${form.city}',
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
