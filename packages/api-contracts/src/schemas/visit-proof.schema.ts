import { VISIT_PROOF_REASONS, VISIT_PROOFS } from '@oneohm/domain';
import { z } from 'zod';

/**
 * Whether the route proves a site visit (Duty Day step 5): `verified` (seen at the site for
 * most of it, 10 min or more, no fake GPS, check-in and photos near), `doubtful` (any check
 * failed: the reasons say which) or `no_proof` (no location at all, or no site pin). Worked
 * out at check-out and again when late points arrive; null while the visit is open.
 */
export const visitProofSchema = z.enum(VISIT_PROOFS);

/**
 * Why: `short_visit`, `not_seen_at_site`, `far_check_in`, `photo_far`, `fake_gps` (doubtful);
 * `no_location`, `site_unknown` (no proof). Empty when verified.
 */
export const visitProofReasonSchema = z.enum(VISIT_PROOF_REASONS);
