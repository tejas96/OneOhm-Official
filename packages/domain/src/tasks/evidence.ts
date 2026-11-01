import { SIGNATURE_CATEGORY } from '../documents/document-categories';
import { isImageType } from '../documents/file-type';
import { isMediaType } from '../documents/media-type';
import { checklistFor, type EvidenceTask, measurementsFor } from './task-checklists';
import { EVIDENCE_KINDS, type EvidenceKind } from './task-template';

/** A file attached to the task, as far as evidence goes. */
export interface EvidenceFile {
  readonly contentType: string;
  readonly category: string;
}

const isSignature = (file: EvidenceFile) => file.category === SIGNATURE_CATEGORY;
const isPhoto = (file: EvidenceFile) => isImageType(file.contentType) && !isSignature(file);
/**
 * A PDF, or any file filed as a paper (not a site photo, not the signature). Voice notes
 * and videos add to the record but never stand in for a required photo or paper.
 */
const isDocument = (file: EvidenceFile) =>
  !isMediaType(file.contentType) &&
  (file.contentType === 'application/pdf' ||
    (file.category !== 'site_photo' && !isSignature(file)));

type Check = (
  task: EvidenceTask,
  files: readonly EvidenceFile[],
  facts: ReadonlySet<string>,
) => boolean;

const HAS: Readonly<Record<EvidenceKind, Check>> = {
  photo: (_task, files) => files.some(isPhoto),
  document: (_task, files) => files.some(isDocument),
  signature: (_task, files) => files.some(isSignature),
  checklist: (task, _files, facts) => checklistFor(task).every((item) => facts.has(item.key)),
  measurement: (task, _files, facts) => measurementsFor(task).every((key) => facts.has(key)),
};

/**
 * Evidence a task still needs before it can complete (PRD 4.4: "a task completes only
 * after its required evidence is uploaded"). Photos, documents and the customer's
 * signature are files on the task; checklist ticks and measurements are project facts
 * (`recorded` holds the keys already saved or sent with the completion).
 */
export function missingEvidence(
  task: EvidenceTask,
  files: readonly EvidenceFile[],
  recorded: ReadonlySet<string>,
): EvidenceKind[] {
  return EVIDENCE_KINDS.filter(
    (kind) => task.evidence.includes(kind) && !HAS[kind](task, files, recorded),
  );
}

/** The measurement facts still empty, for field-level messages. */
export function missingMeasurements(task: EvidenceTask, recorded: ReadonlySet<string>): string[] {
  return measurementsFor(task).filter((key) => !recorded.has(key));
}
