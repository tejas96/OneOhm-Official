const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CHECK = new RegExp(`^vc:(y|n):(${UUID})$`);

/** The customer's tap on "Was this visit done?": the site visit, and Yes or No. */
export interface VisitCheckTap {
  readonly siteVisitId: string;
  readonly said: 'yes' | 'no';
}

/** The tap ids (WhatsApp allows 256 characters). */
export const visitCheckTaps = {
  yes: (siteVisitId: string) => `vc:y:${siteVisitId}`,
  no: (siteVisitId: string) => `vc:n:${siteVisitId}`,
};

export function readVisitCheckTap(id: string | null | undefined): VisitCheckTap | null {
  const match = CHECK.exec(id ?? '');
  if (!match) return null;
  return { siteVisitId: match[2] as string, said: match[1] === 'y' ? 'yes' : 'no' };
}

export const isVisitCheckTap = (id: string) => readVisitCheckTap(id) !== null;
