import { DARK_COLORS, LIGHT_COLORS, PARTY_SWATCHES, type ThemeColors } from '../tokens/colors';

/**
 * Small Lottie illustrations for calm moments (PRD 9.2): a success, a recorded payment,
 * a reward, and two empty states. Authored by `scripts/write-illustrations.mjs` in the
 * light palette; `themeAnimation` swaps each colour for its dark token. They are
 * decorative: players render them hidden from assistive tech, never in the way of a tap.
 */
export type IllustrationName = 'success' | 'payment' | 'reward' | 'clearDay' | 'emptyFolder';
export type IllustrationScheme = 'light' | 'dark';

/** The parts of a Lottie (Bodymovin 5) animation the players read. */
export interface LottieAnimation {
  readonly v: string;
  readonly fr: number;
  readonly ip: number;
  readonly op: number;
  readonly w: number;
  readonly h: number;
  readonly nm?: string;
  readonly assets: unknown[];
  readonly layers: unknown[];
}

interface IllustrationEntry {
  /** Empty states breathe in a slow loop; success moments play once. */
  readonly loop: boolean;
  readonly load: () => Promise<unknown>;
}

/** Each file loads only when its illustration is first shown. */
export const ILLUSTRATIONS: Readonly<Record<IllustrationName, IllustrationEntry>> = {
  success: { loop: false, load: () => import('./success.json') },
  payment: { loop: false, load: () => import('./payment.json') },
  reward: { loop: false, load: () => import('./reward.json') },
  clearDay: { loop: true, load: () => import('./clear-day.json') },
  emptyFolder: { loop: true, load: () => import('./empty-folder.json') },
};

/** The animation itself, whatever shape the bundler gives a JSON module. */
export async function loadIllustration(name: IllustrationName): Promise<LottieAnimation> {
  const module = (await ILLUSTRATIONS[name].load()) as { default?: unknown };
  return (module.default ?? module) as LottieAnimation;
}

/** Token slots the illustrations are drawn with, swapped light → dark by name. */
const SLOTS = [
  'accent',
  'accentSoft',
  'energy',
  'energySoft',
  'surfaceRaised',
  'borderStrong',
] as const satisfies readonly (keyof ThemeColors)[];

/** Light colour → its dark counterpart (upper-case hex), including the reward gold. */
export const DARK_SWAPS: ReadonlyMap<string, string> = new Map([
  ...SLOTS.map((slot) => [LIGHT_COLORS[slot].toUpperCase(), DARK_COLORS[slot]] as const),
  [PARTY_SWATCHES.light.customer.toUpperCase(), PARTY_SWATCHES.dark.customer] as const,
]);

/** [0.247, 0.604, 0.271, 1] → "#3F9A45". */
export function colourHex(channels: readonly number[]): string {
  const part = (value: number | undefined) =>
    Math.round((value ?? 0) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(channels[0])}${part(channels[1])}${part(channels[2])}`.toUpperCase();
}

const channelsOf = (hex: string, alpha: number) =>
  [1, 3, 5]
    .map((at) => Math.round((Number.parseInt(hex.slice(at, at + 2), 16) / 255) * 1000) / 1000)
    .concat(alpha);

/** A still fill or stroke colour: `{ a: 0, k: [r, g, b, a] }`. */
function isStillColour(value: unknown): value is { a: 0; k: number[] } {
  if (!value || typeof value !== 'object') return false;
  const { a, k } = value as { a?: unknown; k?: unknown };
  return a === 0 && Array.isArray(k) && k.length >= 3 && k.every((n) => typeof n === 'number');
}

function swapColours(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(swapColours);
  if (!value || typeof value !== 'object') return value;
  const copy: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (key === 'c' && isStillColour(inner)) {
      const dark = DARK_SWAPS.get(colourHex(inner.k));
      copy[key] = dark ? { a: 0, k: channelsOf(dark, inner.k[3] ?? 1) } : inner;
    } else copy[key] = swapColours(inner);
  }
  return copy;
}

const darkCopies = new WeakMap<object, LottieAnimation>();

/** The animation in the given scheme's colours (light is as authored; dark is cached). */
export function themeAnimation(
  animation: LottieAnimation,
  scheme: IllustrationScheme,
): LottieAnimation {
  if (scheme === 'light') return animation;
  const cached = darkCopies.get(animation);
  if (cached) return cached;
  const dark = swapColours(animation) as LottieAnimation;
  darkCopies.set(animation, dark);
  return dark;
}

/** How long one play takes, in milliseconds. */
export const durationMs = (animation: LottieAnimation) =>
  ((animation.op - animation.ip) / animation.fr) * 1000;
