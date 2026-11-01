import { describe, expect, it } from 'vitest';
import { LIGHT_COLORS } from '../tokens/colors';
import { buildThemeCss } from './build-theme-css';

describe('buildThemeCss', () => {
  const css = buildThemeCss();

  it('maps every theme colour to a Tailwind colour', () => {
    expect(css).toContain('--color-accent: var(--oh-accent);');
    expect(css).toContain(`--oh-accent: ${LIGHT_COLORS.accent};`);
  });

  it('exposes the brand gradient colours and party swatches', () => {
    expect(css).toContain('--color-brand-green: #56BD39;');
    expect(css).toContain('--color-party-discom: var(--oh-party-discom);');
  });

  it('switches to dark values by preference or data-theme', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(":root[data-theme='dark']");
  });

  it('collapses movement under calm motion but keeps fades', () => {
    expect(css).toMatch(/:root\[data-motion='calm'\] \{[^}]*--duration-base: 1ms;/);
    expect(css).toMatch(/:root\[data-motion='calm'\] \{[^}]*--duration-fade: 120ms;/);
  });
});
