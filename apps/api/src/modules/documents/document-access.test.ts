import type { Capability, RoleKind } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../common/auth/actor';
import {
  canAttach,
  canDownloadDocument,
  canDownloadMany,
  canPrintDocuments,
  type DocumentLinks,
} from './document-access';

const actor = (kind: RoleKind, capabilities: readonly Capability[], userId = 'me'): Actor =>
  ({ userId, kind, capabilities: new Set(capabilities) }) as unknown as Actor;

const file = (overrides: Partial<DocumentLinks> = {}): DocumentLinks => ({
  uploadedByUserId: 'someone',
  category: 'electricity_bill',
  taskAssigneeId: null,
  taskCompleted: false,
  ...overrides,
});

describe('document rights (PRD 3.14)', () => {
  it('lets a viewer look but not download without documents.download', () => {
    const viewer = actor('staff', ['documents.view']);
    expect(canDownloadDocument(viewer, file())).toBe(false);
    expect(canDownloadMany(viewer)).toBe(false);
    expect(canPrintDocuments(viewer)).toBe(false);
  });

  it('lets download and print be granted on their own', () => {
    const clerk = actor('staff', ['documents.view', 'documents.download', 'documents.print']);
    expect(canDownloadDocument(clerk, file())).toBe(true);
    expect(canDownloadMany(clerk)).toBe(true);
    expect(canPrintDocuments(clerk)).toBe(true);
  });

  it('always lets people download their own uploads and task evidence', () => {
    const crew = actor('partner', ['documents.view']);
    expect(canDownloadDocument(crew, file({ uploadedByUserId: 'me' }))).toBe(true);
    expect(canDownloadDocument(crew, file({ taskAssigneeId: 'me' }))).toBe(true);
    expect(canDownloadDocument(crew, file())).toBe(false);
  });

  it('allows upload with documents.upload, or evidence on your own task', () => {
    expect(canAttach(actor('staff', ['documents.upload']), null)).toBe(true);
    expect(canAttach(actor('staff', ['documents.view']), null)).toBe(false);
    expect(canAttach(actor('partner', []), 'me')).toBe(true);
  });

  it('treats documents.manage as every document right', () => {
    const manager = actor('staff', ['documents.view', 'documents.manage']);
    expect(canAttach(manager, null)).toBe(true);
    expect(canDownloadDocument(manager, file())).toBe(true);
    expect(canPrintDocuments(manager)).toBe(true);
  });
});
