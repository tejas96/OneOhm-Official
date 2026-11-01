/**
 * Three sidebar treatments, compared in the design lab:
 * - `glow`: the hero surface down the left edge (white lit by the logo's glow in light,
 *   deep ocean in dark); the current page glows softly.
 * - `ink`: paper sidebar; the current page is a solid ink pill.
 * - `tint`: paper sidebar; the current page is a soft Ohm-blue wash.
 */
export type SidebarLook = 'glow' | 'ink' | 'tint';

interface LookClasses {
  readonly aside: string;
  readonly muted: string;
  readonly group: string;
  readonly search: string;
  readonly item: string;
  readonly itemActive: string;
  readonly icon: string;
  readonly iconActive: string;
  readonly divider: string;
  readonly account: string;
}

export const SIDEBAR_LOOKS: Readonly<Record<SidebarLook, LookClasses>> = {
  glow: {
    aside: 'oh-panel md:my-2 md:ml-2 md:h-[calc(100dvh-1rem)] md:rounded-2xl',
    muted: 'text-on-panel-muted',
    group: 'text-on-panel-muted/80',
    search:
      'border-on-panel/15 bg-on-panel/[0.06] text-on-panel-muted hover:border-on-panel/30 hover:text-on-panel',
    item: 'text-on-panel-muted hover:bg-on-panel/[0.07] hover:text-on-panel',
    itemActive:
      'bg-on-panel/[0.12] font-medium text-on-panel shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]',
    icon: 'text-on-panel-muted/80',
    iconActive: 'text-brand-green',
    divider: 'border-on-panel/12',
    account: 'hover:bg-on-panel/[0.07]',
  },
  ink: {
    aside: '',
    muted: 'text-ink-faint',
    group: 'text-ink-faint',
    search:
      'border-hairline bg-raised/70 text-ink-faint shadow-e1 hover:border-rule hover:text-ink-muted',
    item: 'text-ink-muted hover:bg-sunken/70 hover:text-ink',
    itemActive: 'bg-ink font-medium text-canvas shadow-e2',
    icon: 'text-ink-faint',
    iconActive: 'text-canvas',
    divider: 'border-hairline',
    account: 'hover:bg-sunken',
  },
  tint: {
    aside:
      'md:my-2 md:ml-2 md:h-[calc(100dvh-1rem)] md:rounded-2xl md:border md:border-hairline md:bg-raised md:shadow-e1',
    muted: 'text-ink-faint',
    group: 'text-ink-faint',
    search: 'border-hairline bg-surface text-ink-faint hover:border-rule hover:text-ink-muted',
    item: 'text-ink-muted hover:bg-surface hover:text-ink',
    itemActive: 'bg-accent-soft font-medium text-on-accent-soft',
    icon: 'text-ink-faint',
    iconActive: 'text-accent',
    divider: 'border-hairline',
    account: 'hover:bg-surface',
  },
};
