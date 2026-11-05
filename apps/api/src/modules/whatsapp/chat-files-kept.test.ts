import { describe, expect, it } from 'vitest';
import { leftToSort, whatsappFileScope } from './chat-files-kept';

describe('the storage folder of a WhatsApp file', () => {
  it('keeps a plain media id', () => {
    expect(whatsappFileScope('c1', 'wamid-12_3')).toBe('customers/c1/whatsapp/wamid-12_3/');
  });

  it('lets no dot or slash through, so a media id cannot climb out of the folder', () => {
    expect(whatsappFileScope('c1', '..')).toBe('customers/c1/whatsapp/__/');
    expect(whatsappFileScope('c1', '../x.y/z')).toBe('customers/c1/whatsapp/___x_y_z/');
  });
});

describe('a kept WhatsApp file left to sort', () => {
  const home = { projectId: 'j1', propertyId: 'p1', category: 'other' };
  const person = { projectId: null, propertyId: null, category: 'customer_kyc' };

  it('is to sort with no home chosen', () => {
    expect(leftToSort(null, false)).toBe(true);
  });

  it('is filed on a home, and a paper on the person row', () => {
    expect(leftToSort(home, true)).toBe(false);
    expect(leftToSort(person, false)).toBe(false);
  });

  it('is to sort for a voice note or video on the person row (kept as Other, no home)', () => {
    expect(leftToSort(person, true)).toBe(true);
  });
});
