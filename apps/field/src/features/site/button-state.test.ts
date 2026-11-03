import { describe, expect, it } from 'vitest';
import { buttonState } from './button-state';

describe('buttonState', () => {
  it('shows the progress label, not the spinner, while reading', () => {
    expect(buttonState(true, 'Finding your location… 18 m', 'Check in at site')).toEqual({
      label: 'Finding your location… 18 m',
      pending: false,
      disabled: true,
    });
  });
  it('shows the spinner once the request is running', () => {
    expect(buttonState(true, null, 'Check in at site')).toEqual({
      label: 'Check in at site',
      pending: true,
      disabled: false,
    });
  });
  it('is idle otherwise', () => {
    expect(buttonState(false, null, 'Check in at site').pending).toBe(false);
  });
});
