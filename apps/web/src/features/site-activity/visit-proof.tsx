'use client';

import type { SiteVisit } from '@oneohm/api-contracts';
import { StatusPill, Tooltip } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

type Proof = NonNullable<SiteVisit['proof']>;
type Reason = SiteVisit['proofReasons'][number];

const TONE = { verified: 'onTrack', doubtful: 'atRisk', no_proof: 'neutral' } as const;
const GLYPH = { verified: 'done', doubtful: 'atRisk', no_proof: 'ready' } as const;

/** The reasons in plain words, joined: "too short, not seen at the site". */
export function useProofReasons(): (reasons: readonly Reason[]) => string {
  const t = useTranslations('siteActivity.proof');
  return (reasons) => reasons.map((reason) => t(`reasons.${reason}`)).join(', ');
}

/**
 * Whether the route proves a visit: Verified (green), Doubtful (amber, the reasons on hover
 * or focus and for screen readers) or No proof (grey). Nothing while the visit is open.
 */
export function VisitProof({
  proof,
  reasons,
  showReasons = false,
}: {
  readonly proof: Proof | null;
  readonly reasons: readonly Reason[];
  /** Write the reasons under the badge instead of only in the tooltip. */
  readonly showReasons?: boolean;
}) {
  const t = useTranslations('siteActivity.proof');
  const words = useProofReasons()(reasons);
  if (!proof) return null;
  const pill = <StatusPill tone={TONE[proof]} glyph={GLYPH[proof]} label={t(proof)} size="sm" />;
  if (showReasons || !words)
    return (
      <span className="inline-flex flex-col items-end gap-0.5 md:items-start">
        {pill}
        {showReasons && words && <span className="type-label text-ink-muted">{words}</span>}
      </span>
    );
  return (
    <Tooltip content={t('why', { reasons: words })}>
      <button
        type="button"
        aria-label={`${t(proof)}: ${words}`}
        className="inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {pill}
      </button>
    </Tooltip>
  );
}
