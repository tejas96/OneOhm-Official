import { describe, expect, it } from 'vitest';
import type { CustomerHome } from '../../customer-portal/customer-homes';
import { chooseHome, fileHomeTapped } from './file-home';

const home = (propertyId: string): CustomerHome => ({
  propertyId,
  projectId: null,
  title: propertyId,
  description: '',
});
const A = home('aaaaaaaa-0000-4000-8000-000000000001');
const B = home('bbbbbbbb-0000-4000-8000-000000000002');
const now = Date.UTC(2026, 10, 4, 10);
const minutesAgo = (minutes: number) => now - minutes * 60_000;

describe('which home a WhatsApp file is for', () => {
  it('one home is that home, never a question', () => {
    expect(chooseHome({ homes: [A], openSiteRequestHomes: [], remembered: null, now })).toEqual({
      propertyId: A.propertyId,
    });
  });

  it('two homes: the home picked 10 minutes ago', () => {
    const remembered = { propertyId: B.propertyId, at: minutesAgo(10) };
    expect(chooseHome({ homes: [A, B], openSiteRequestHomes: [], remembered, now })).toEqual({
      propertyId: B.propertyId,
    });
  });

  it('two homes: a pick 31 minutes ago no longer counts', () => {
    const remembered = { propertyId: B.propertyId, at: minutesAgo(31) };
    expect(chooseHome({ homes: [A, B], openSiteRequestHomes: [], remembered, now })).toBe('ask');
  });

  it('two homes: the only one with open site requests', () => {
    expect(
      chooseHome({ homes: [A, B], openSiteRequestHomes: [B.propertyId], remembered: null, now }),
    ).toEqual({ propertyId: B.propertyId });
  });

  it('two homes, both with open requests or none: ask', () => {
    const both = [A.propertyId, B.propertyId];
    expect(chooseHome({ homes: [A, B], openSiteRequestHomes: both, remembered: null, now })).toBe(
      'ask',
    );
    expect(chooseHome({ homes: [A, B], openSiteRequestHomes: [], remembered: null, now })).toBe(
      'ask',
    );
  });

  it('the person row is remembered too; a home no longer active is not', () => {
    const person = { propertyId: 'person', at: minutesAgo(5) };
    expect(
      chooseHome({ homes: [A, B], openSiteRequestHomes: [], remembered: person, now }),
    ).toEqual({ propertyId: 'person' });
    const gone = { propertyId: 'cccccccc-0000-4000-8000-000000000003', at: minutesAgo(5) };
    expect(chooseHome({ homes: [A, B], openSiteRequestHomes: [], remembered: gone, now })).toBe(
      'ask',
    );
  });

  it('reads the home rows and the person row, nothing else', () => {
    expect(fileHomeTapped(`fhome:${A.propertyId}`)).toBe(A.propertyId);
    expect(fileHomeTapped('fhome:person')).toBe('person');
    expect(fileHomeTapped(`home:${A.propertyId}`)).toBeNull();
    expect(fileHomeTapped('fhome:nope')).toBeNull();
    expect(fileHomeTapped(null)).toBeNull();
  });
});
