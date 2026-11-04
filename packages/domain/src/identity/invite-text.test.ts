import { describe, expect, it } from 'vitest';
import { DEFAULT_MESSAGE_TEMPLATES } from '../messaging/message-templates';
import { inviteText } from './invite-text';

describe('invite text', () => {
  it('is the staff_welcome sentence with the name and link filled in', () => {
    expect(inviteText('Asha', 'https://app.oneohm.in')).toBe(
      'Hi Asha, you have been added to the OneOhm team. Open the app here: https://app.oneohm.in. Sign in with this mobile number. For the website, choose "First time here?" to set your password.',
    );
  });

  it('stays the same wording as the WhatsApp template preview', () => {
    const template = DEFAULT_MESSAGE_TEMPLATES.find((entry) => entry.key === 'staff_welcome');
    expect(template?.audience).toBe('staff');
    expect(template?.fields).toEqual(['name', 'link']);
    expect(template?.preview.replace('{{1}}', 'Asha').replace('{{2}}', 'L')).toBe(
      inviteText('Asha', 'L'),
    );
  });
});
