/**
 * OneOhm brand colours, sampled from the logo (globe and Ω run green → teal → blue,
 * the tagline is deep ocean). Used exactly in gradients and marks; interface
 * colours derive from them in colors.ts with contrast checked.
 */
export const BRAND = {
  green: '#56BD39',
  teal: '#21998C',
  blue: '#0078B9',
  ocean: '#035A82',
} as const;

/** The logo gradient, top to bottom. Spent once per screen (rings, the journey dial). */
export const BRAND_GRADIENT_STOPS = [
  { offset: 0, color: BRAND.green },
  { offset: 0.5, color: BRAND.teal },
  { offset: 1, color: BRAND.blue },
] as const;
