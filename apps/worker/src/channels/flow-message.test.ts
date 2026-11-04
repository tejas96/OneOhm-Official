import { describe, expect, it } from 'vitest';
import { sessionRequestBody } from './session-message';

describe('a form message', () => {
  it('sessionRequestBody flow opens the form on its screen with the start data, no endpoint', () => {
    expect(
      sessionRequestBody('+919800000000', {
        kind: 'flow',
        body: 'Please send your bill.\n\nOr just send the photo here.',
        button: 'A very long form button label here',
        flowId: '123456',
        token: 'tok-1',
        screen: 'SEND_PAPER',
        data: { heading: 'Electricity bill — Sangli' },
      }),
    ).toMatchObject({
      to: '919800000000',
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: 'Please send your bill.\n\nOr just send the photo here.' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: 'tok-1',
            flow_id: '123456',
            flow_cta: 'A very long form button label ',
            flow_action: 'navigate',
            flow_action_payload: {
              screen: 'SEND_PAPER',
              data: { heading: 'Electricity bill — Sangli' },
            },
          },
        },
      },
    });
  });

  it('sessionRequestBody location_request is the WhatsApp Send location button', () => {
    expect(
      sessionRequestBody('+919800000000', {
        kind: 'location_request',
        body: 'Share your location.',
      }),
    ).toMatchObject({
      to: '919800000000',
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: 'Share your location.' },
        action: { name: 'send_location' },
      },
    });
  });
});
