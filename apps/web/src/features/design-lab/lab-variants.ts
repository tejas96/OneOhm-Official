import type { SidebarLook } from '../shell/sidebar-looks';

/** The three command-centre directions in the design lab, each with its sidebar look. */
export const LAB_VARIANTS = [
  { id: 'circuit', sidebar: 'ocean' },
  { id: 'editorial', sidebar: 'ink' },
  { id: 'bento', sidebar: 'tint' },
] as const satisfies ReadonlyArray<{ id: string; sidebar: SidebarLook }>;

export type LabVariant = (typeof LAB_VARIANTS)[number]['id'];

export function isLabVariant(value: string): value is LabVariant {
  return LAB_VARIANTS.some((variant) => variant.id === value);
}
