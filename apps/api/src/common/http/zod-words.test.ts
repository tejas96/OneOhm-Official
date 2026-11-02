import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fieldLabel, plainIssue, validationSentence } from './zod-words';

const first = (schema: z.ZodTypeAny, value: unknown) => {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected a failure');
  const [issue] = result.error.issues;
  if (!issue) throw new Error('no issue');
  return plainIssue(issue);
};

describe('plainIssue', () => {
  it('says a blank or missing field is required', () => {
    expect(first(z.string().min(1), '')).toBe('This is required.');
    expect(first(z.object({ note: z.string() }), {})).toBe('This is required.');
  });
  it('words lengths and numbers plainly', () => {
    expect(first(z.string().max(5), 'too long text')).toBe('Keep it to 5 characters or fewer.');
    expect(first(z.number().positive(), 0)).toBe('Enter more than 0.');
    expect(first(z.number(), 'x')).toBe('Enter a number.');
    expect(first(z.enum(['a', 'b']), 'c')).toBe('Pick one of the options.');
    expect(first(z.string().uuid(), 'x')).toBe('Pick one from the list.');
  });
  it('keeps a message written in the contract', () => {
    expect(first(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'), '12')).toBe(
      'Enter the 6-digit code.',
    );
  });
});

describe('validationSentence', () => {
  it('names the field to fix', () => {
    expect(fieldLabel('property.addressLine')).toBe('Address line');
    expect(fieldLabel('lines.0.quantity')).toBe('Quantity');
    expect(fieldLabel('discountPaise')).toBe('Discount');
    expect(validationSentence({ note: 'This is required.' })).toBe('Check Note: This is required.');
    expect(validationSentence({ name: 'This is required.', city: 'This is required.' })).toBe(
      'Check Name: This is required. (and 1 more)',
    );
  });
});
