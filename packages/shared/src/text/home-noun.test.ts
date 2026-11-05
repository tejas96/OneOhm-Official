import { describe, expect, it } from 'vitest';
import { homeEn, homeHi, homeMr } from './home-noun';

describe('home noun', () => {
  it('prints the label once', () => {
    expect(homeEn('Home')).toBe('home');
    expect(homeEn('Farm')).toBe('Farm home');
    expect(homeEn('Sangli house')).toBe('Sangli house');
    expect(homeEn('Farm home')).toBe('Farm home');
    expect(homeEn('')).toBe('home');
    expect(homeHi('Home')).toBe('घर');
    expect(homeHi('घर')).toBe('घर');
    expect(homeHi('Farm')).toBe('Farm घर');
    expect(homeHi('Sangli house')).toBe('Sangli house');
    expect(homeMr('Home', 'घराचे')).toBe('घराचे');
    expect(homeMr('Farm', 'घराचे')).toBe('Farm घराचे');
    expect(homeMr('Home', 'येथील घरासाठी')).toBe('घरासाठी');
    expect(homeMr('Farm', 'येथील घरासाठी')).toBe('Farm येथील घरासाठी');
    expect(homeMr('Sangli house', 'घरासाठी')).toBe('Sangli house साठी');
    expect(homeMr('Sangli house', 'घरी')).toBe('Sangli house');
  });
});
