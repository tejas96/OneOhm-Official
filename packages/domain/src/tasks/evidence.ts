import { isImageType } from '../documents/file-type';
import type { EvidenceKind } from './task-template';

/**
 * Evidence a task still needs before it can complete (PRD 4.4: "a task completes only
 * after its required evidence is uploaded"). Photos are enforced: at least one image
 * attached to the task. Documents, checklists, measurements and signatures are guided
 * in the task screen but not blocked here.
 */
export function missingEvidence(
  required: readonly string[],
  attachedContentTypes: readonly string[],
): EvidenceKind[] {
  const missing: EvidenceKind[] = [];
  if (required.includes('photo') && !attachedContentTypes.some(isImageType)) missing.push('photo');
  return missing;
}
