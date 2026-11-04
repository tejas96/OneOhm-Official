import type { Person } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { inviteActions } from './invite-actions';

const invited = (over: Partial<Person> = {}): Person =>
  ({
    id: 'p1',
    fullName: 'Asha Kale',
    status: 'active',
    invite: 'not_signed_in',
    inviteText: 'Hi Asha, you have been added to the OneOhm team.',
    invitesOn: true,
    ...over,
  }) as Person;

describe('inviteActions', () => {
  it('offers send again and copy while invites are on', () => {
    expect(inviteActions(invited())).toEqual(['sendAgain', 'copyText']);
  });

  it('hides send again while invites are off: copying is the one action', () => {
    expect(inviteActions(invited({ invitesOn: false }))).toEqual(['copyText']);
  });

  it('offers nothing once they signed in, or after they left', () => {
    expect(inviteActions(invited({ invite: 'signed_in', inviteText: null }))).toEqual([]);
    expect(inviteActions(invited({ status: 'inactive' }))).toEqual([]);
  });
});
