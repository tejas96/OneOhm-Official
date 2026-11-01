import { type Actor, can } from '../../common/auth/actor';

/** The links that decide who may see or change a document. */
export interface DocumentLinks {
  readonly uploadedByUserId: string | null;
  readonly category: string;
  /** The assignee of the linked task, when the document belongs to a task. */
  readonly taskAssigneeId: string | null;
  readonly taskCompleted: boolean;
}

export const isCompanyAsset = (category: string) => category.startsWith('company_');

/** Staff with `documents.view` see every file; partners and resellers only their own work. */
export const canViewAllDocuments = (actor: Actor) =>
  actor.kind === 'staff' && can(actor, 'documents.view');

/**
 * Staff with `documents.view` see everything; everyone else sees the files of the tasks
 * assigned to them and what they uploaded themselves (partner and reseller isolation).
 * Company assets are printed on every quotation, so anyone signed in may see them.
 */
export function canViewDocument(actor: Actor, links: DocumentLinks): boolean {
  if (isCompanyAsset(links.category) || canViewAllDocuments(actor)) return true;
  return links.uploadedByUserId === actor.userId || links.taskAssigneeId === actor.userId;
}

/** Managers may change any file; the assignee may change evidence until the task is done. */
export function canChangeDocument(actor: Actor, links: DocumentLinks): boolean {
  if (isCompanyAsset(links.category)) return can(actor, 'settings.manage');
  if (can(actor, 'documents.manage')) return true;
  return !links.taskCompleted && links.taskAssigneeId === actor.userId;
}

/** `documents.upload` or `documents.manage`: may add files to any customer or project. */
export const canUploadDocuments = (actor: Actor) =>
  can(actor, 'documents.upload') || can(actor, 'documents.manage');

/** Uploading: the right to upload, or evidence on a task assigned to the person. */
export function canAttach(actor: Actor, taskAssigneeId: string | null): boolean {
  return canUploadDocuments(actor) || (taskAssigneeId !== null && taskAssigneeId === actor.userId);
}

/**
 * Saving a copy (PRD 3.14): `documents.download`, or the person's own work. Opening a
 * file to look at it needs only the right to see it.
 */
export function canDownloadDocument(actor: Actor, links: DocumentLinks): boolean {
  if (!canViewDocument(actor, links)) return false;
  if (isCompanyAsset(links.category)) return true;
  if (can(actor, 'documents.download') || can(actor, 'documents.manage')) return true;
  return links.uploadedByUserId === actor.userId || links.taskAssigneeId === actor.userId;
}

/** Printing and one combined PDF of many files: `documents.print`. */
export const canPrintDocuments = (actor: Actor) =>
  can(actor, 'documents.print') || can(actor, 'documents.manage');

/** One ZIP of many files: `documents.download`. */
export const canDownloadMany = (actor: Actor) =>
  can(actor, 'documents.download') || can(actor, 'documents.manage');
