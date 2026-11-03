import { describe, expect, it } from 'vitest';
import { pickContact } from './payment-contact';

const pm = { name: 'Priya Kulkarni', phone: null };
const owner = { name: 'Bharat Patil', phone: '+919800000002' };
const admin = { name: 'Asha Kale', phone: '+919800000003' };

// Live review C6 (fix round 1): the next-step message always names someone to call.
describe('who the customer can call after paying', () => {
  it('skips a project manager with no phone for the lead owner who has one', () => {
    expect(pickContact([pm, owner], [admin], '+912000000000')).toEqual(owner);
  });

  it('falls back to the business owner or admin with a phone', () => {
    expect(pickContact([pm], [{ name: 'No Phone', phone: null }, admin], null)).toEqual(admin);
  });

  it('with no phone anywhere: the manager by name, with the business phone if there is one', () => {
    expect(pickContact([pm], [], '+912000000000')).toEqual({
      name: 'Priya Kulkarni',
      phone: '+912000000000',
    });
    expect(pickContact([pm], [], null)).toEqual({ name: 'Priya Kulkarni', phone: null });
    expect(pickContact([], [], '+912000000000')).toEqual({ name: null, phone: '+912000000000' });
  });
});
