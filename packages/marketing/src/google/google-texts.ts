import { bodyOf, cutOnWord } from '@oneohm/domain';
import type { LaunchInput } from '../types';

export interface GoogleTexts {
  readonly headlines: readonly string[];
  readonly longHeadline: string;
  /** The first is the short one (60 characters at most). */
  readonly descriptions: readonly [string, string];
  readonly businessName: string;
}

/** The words Google wants for a Performance Max ad, cut to its limits. */
export function googleTexts(input: LaunchInput): GoogleTexts {
  const city = input.city.name;
  const seen = new Set<string>();
  const headlines: string[] = [];
  for (const candidate of [
    input.headline,
    input.businessName,
    `Rooftop solar in ${city}`,
    'Solar with govt subsidy',
    'Free site visit',
  ]) {
    const cut = cutOnWord(candidate, 30);
    if (!cut || seen.has(cut.toLowerCase())) continue;
    seen.add(cut.toLowerCase());
    headlines.push(cut);
  }
  const short = cutOnWord(input.headline, 60) || 'Free site visit and subsidy help';
  let long = cutOnWord(bodyOf(input.text), 90);
  if (!long || long === short) long = 'Rooftop solar with government subsidy and a free site visit';
  return {
    headlines: headlines.slice(0, 5),
    longHeadline: cutOnWord(input.headline || input.name, 90) || `Rooftop solar in ${city}`,
    descriptions: [short, long],
    businessName: cutOnWord(input.businessName, 25),
  };
}
