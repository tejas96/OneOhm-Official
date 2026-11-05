const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TAP = new RegExp(`^(sgn:ok|sgn:q|rdy:y|rdy:n|rdy:now|ins:y|ins:bad|hpack|jr):(${UUID})$`);

/** A tap on a button the journey messages carry (redesign §4, §18). */
export type JourneyTap = {
  readonly t:
    | 'agree'
    | 'question'
    | 'ready'
    | 'notYet'
    | 'readyNow'
    | 'installOk'
    | 'installBad'
    | 'pack'
    | 'show';
  /** The customer action, or for the handover pack the project. */
  readonly id: string;
};

const KIND = {
  'sgn:ok': 'agree',
  'sgn:q': 'question',
  'rdy:y': 'ready',
  'rdy:n': 'notYet',
  'rdy:now': 'readyNow',
  'ins:y': 'installOk',
  'ins:bad': 'installBad',
  hpack: 'pack',
  jr: 'show',
} as const;

/** The tap an id stands for, or null. */
export function readJourneyTap(id: string | null | undefined): JourneyTap | null {
  const match = TAP.exec(id ?? '');
  if (!match?.[1] || !match[2]) return null;
  return { t: KIND[match[1] as keyof typeof KIND], id: match[2] };
}

export const isJourneyTap = (id: string) => readJourneyTap(id) !== null;

export const agreeTap = (actionId: string) => `sgn:ok:${actionId}`;
export const questionTap = (actionId: string) => `sgn:q:${actionId}`;
export const readyTap = (actionId: string) => `rdy:y:${actionId}`;
export const notYetTap = (actionId: string) => `rdy:n:${actionId}`;
export const readyNowTap = (actionId: string) => `rdy:now:${actionId}`;
export const installOkTap = (actionId: string) => `ins:y:${actionId}`;
export const installBadTap = (actionId: string) => `ins:bad:${actionId}`;
export const packTap = (projectId: string) => `hpack:${projectId}`;
export const showTap = (actionId: string) => `jr:${actionId}`;
