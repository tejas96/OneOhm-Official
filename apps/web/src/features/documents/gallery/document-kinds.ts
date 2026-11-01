import type { DocumentRecord } from '@oneohm/api-contracts';
import { type DocumentCategory, isDocumentCategory } from '@oneohm/domain';
import {
  BadgeCheck,
  BadgeIndianRupee,
  BookOpen,
  Camera,
  FileCheck,
  Folder,
  Handshake,
  House,
  IdCard,
  Landmark,
  Layers,
  type LucideIcon,
  Package,
  Receipt,
  Ruler,
  ScrollText,
  ShieldCheck,
  UtilityPole,
  Zap,
} from 'lucide-react';

/** "All documents" or one of the fixed categories. */
export type FolderChoice = DocumentCategory | 'all';
/** How the library groups files for the type chips: voice notes and videos are "media". */
export type DocumentKind = 'image' | 'pdf' | 'media' | 'other';
/** The finer word on a card: a voice note and a video are both media. */
export type KindLabel = 'image' | 'pdf' | 'audio' | 'video' | 'other';
export type KindFilter = DocumentKind | 'all';

export const FOLDER_ICONS: Readonly<Record<FolderChoice, LucideIcon>> = {
  all: Layers,
  site_photo: Camera,
  site_survey: Ruler,
  customer_kyc: IdCard,
  electricity_bill: Zap,
  property: House,
  quotation: ScrollText,
  invoice_receipt: Receipt,
  vendor: Package,
  dcr_certificate: BadgeCheck,
  bank_loan: Landmark,
  discom: UtilityPole,
  subsidy: BadgeIndianRupee,
  commissioning_handover: Handshake,
  warranty: ShieldCheck,
  product_manual: BookOpen,
  statutory_report: FileCheck,
  other: Folder,
};

/** The folder a document sits in; anything unexpected is filed under Other. */
export function folderOf(document: DocumentRecord): DocumentCategory {
  return isDocumentCategory(document.category) ? document.category : 'other';
}

export function kindOf(contentType: string): DocumentKind {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType === 'application/pdf') return 'pdf';
  if (isAudio(contentType) || isVideo(contentType)) return 'media';
  return 'other';
}

export const isAudio = (contentType: string) => contentType.startsWith('audio/');
export const isVideo = (contentType: string) => contentType.startsWith('video/');

export function kindLabelOf(contentType: string): KindLabel {
  if (isAudio(contentType)) return 'audio';
  if (isVideo(contentType)) return 'video';
  const kind = kindOf(contentType);
  return kind === 'media' ? 'other' : kind;
}

/** Browsers show JPEG, PNG and WebP; HEIC photos get a tile and download instead. */
export function showsInline(contentType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(contentType);
}

/** "Roof photo east.jpg" → "Roof photo east": the name people search and read. */
export function titleOf(name: string): string {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '').trim() || name;
}

/** "PDF", "JPG", "HEIC": the file's extension, set like a label on a paper file. */
export function extensionOf(name: string): string {
  const parts = name.split('.');
  const extension = parts.length > 1 ? (parts.pop() ?? '') : '';
  return extension.length > 0 && extension.length <= 5 ? extension.toUpperCase() : 'FILE';
}

export interface GalleryFilters {
  readonly folder: FolderChoice;
  readonly kind: KindFilter;
  readonly search: string;
}

function matchesSearch(document: DocumentRecord, needle: string): boolean {
  if (!needle) return true;
  return [document.name, document.taskTitle, document.projectCode].some((text) =>
    text?.toLowerCase().includes(needle),
  );
}

/** Applies the search and the type chip; the folder is applied separately so counts can use the rest. */
export function matchesSearchAndKind(
  document: DocumentRecord,
  filters: Omit<GalleryFilters, 'folder'>,
): boolean {
  const kindMatches = filters.kind === 'all' || kindOf(document.contentType) === filters.kind;
  return kindMatches && matchesSearch(document, filters.search.trim().toLowerCase());
}

export const DEFAULT_FILTERS: GalleryFilters = { folder: 'all', kind: 'all', search: '' };
