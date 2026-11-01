import type { DocumentChecklist, DocumentRecord } from '@oneohm/api-contracts';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { upload } from '../support/files';
import { Session } from '../support/http';
import { type Sale, sellProject } from '../support/sales';
import { CREWS, staffEmail, TEAM_PASSWORD } from '../support/team';

// PRD 13 "Documents": find, download, select and print project documents easily.
const quotationFiled = (checklist: DocumentChecklist) =>
  checklist.items.some((entry) => entry.key === 'quotation' && entry.status === 'present');

describe('Documents', () => {
  let admin: Session;
  let liaison: Session;
  let execution: Session;
  let sale: Sale;
  const mine: Record<string, string> = {};

  beforeAll(async () => {
    admin = await Session.admin();
    liaison = await Session.password(staffEmail('liaisoning'), TEAM_PASSWORD);
    execution = await Session.password(staffEmail('execution'), TEAM_PASSWORD);
    sale = await sellProject(admin, { name: 'Documents Customer (test)' });
    const projectId = sale.project.id;
    // The papers a liaisoning person files while working the project.
    const files = [
      ['bill', 'document', 'electricity_bill', 'Electricity bill (test)'],
      ['kyc', 'photo', 'customer_kyc', 'Aadhaar card (test)'],
      ['property', 'document', 'property', 'Property tax receipt (test)'],
      ['roof', 'photo', 'site_photo', 'Roof east side (test)'],
    ] as const;
    for (const [key, kind, category, name] of files) {
      const doc = await upload<DocumentRecord>(liaison, kind, { projectId, category, name });
      mine[key] = doc.id;
    }
  });

  it('finds every project paper in one list, newest first, and filters by kind', async () => {
    const all = await execution.get<DocumentRecord[]>(`/documents?projectId=${sale.project.id}`);
    const ids = all.map((doc) => doc.id);
    for (const id of Object.values(mine)) expect(ids).toContain(id);
    const times = all.map((doc) => doc.createdAt);
    expect([...times].sort().reverse()).toEqual(times);

    const bills = await execution.get<DocumentRecord[]>(
      `/documents?projectId=${sale.project.id}&category=electricity_bill`,
    );
    expect(bills.map((doc) => doc.id)).toEqual([mine.bill]);
    expect(bills[0]?.name).toContain('Electricity bill (test)');
    expect(bills[0]?.uploadedBy?.fullName).toBe(liaison.name);
  });

  it('downloads a paper and shows a small preview of a photo', async () => {
    const file = await execution.download(`/documents/${mine.bill}/file?disposition=attachment`);
    expect(file.status).toBe(200);
    expect(file.type).toContain('application/pdf');
    expect(file.bytes.subarray(0, 4).toString()).toBe('%PDF');

    const photo = await execution.download(`/documents/${mine.roof}/file`);
    expect(photo.status).toBe(200);
    expect(photo.type).toMatch(/^image\//);

    const thumb = await execution.download(`/documents/${mine.roof}/thumbnail`);
    expect(thumb.status).toBe(200);
    expect(thumb.type).toMatch(/^image\//);
    expect(thumb.bytes.length).toBeGreaterThan(0);
  });

  it('shows which papers the project has and which are missing, and prints that list', async () => {
    // System papers (the accepted quotation PDF) are filed on first read; a slow print
    // finishes in the background and shows on the next read, so read until it is there.
    let checklist = await execution.get<DocumentChecklist>(
      `/projects/${sale.project.id}/document-checklist`,
    );
    for (let tries = 0; tries < 10 && !quotationFiled(checklist); tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      checklist = await execution.get<DocumentChecklist>(
        `/projects/${sale.project.id}/document-checklist`,
      );
    }
    const item = (key: string) => checklist.items.find((entry) => entry.key === key);
    expect(item('bill')?.status).toBe('present');
    expect(item('bill')?.documentIds).toContain(mine.bill);
    expect(item('kyc')?.status).toBe('present');
    expect(item('property')?.status).toBe('present');
    // The system files the accepted quotation by itself.
    expect(item('quotation')?.status).toBe('present');
    // Papers nobody filed yet are listed as missing, with the reason they are needed.
    const missing = checklist.items.filter((entry) => entry.status === 'missing');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((entry) => entry.why.length > 0)).toBe(true);
    expect(checklist.present).toBeLessThan(checklist.total);

    const pdf = await execution.download(`/projects/${sale.project.id}/document-checklist/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.bytes.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('downloads a selection as one ZIP', async () => {
    const ids = [mine.bill, mine.kyc, mine.roof] as string[];
    const zip = await execution.download('/documents/bundle/zip', {
      ids,
      name: sale.project.code,
    });
    expect(zip.status).toBe(200);
    expect(zip.type).toContain('application/zip');
    expect(zip.bytes.subarray(0, 2).toString()).toBe('PK');
    // Every chosen file is inside: each entry's name appears in the archive directory.
    const listing = zip.bytes.toString('latin1');
    expect(listing).toContain('Electricity bill (test)');
    expect(listing).toContain('Aadhaar card (test)');
    expect(listing).toContain('Roof east side (test)');
  });

  it('prints a selection as one PDF: papers keep their pages, photos get a page each', async () => {
    const ids = [mine.bill, mine.property, mine.kyc, mine.roof] as string[];
    const pdf = await execution.download('/documents/bundle/pdf', {
      ids,
      name: sale.project.code,
    });
    expect(pdf.status).toBe(200);
    expect(pdf.type).toContain('application/pdf');
    const doc = await PDFDocument.load(new Uint8Array(pdf.bytes));
    // Two one-page PDFs and two photos.
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);
  });

  it('keeps a crew out of the office papers of a project that is not theirs', async () => {
    const outsider = await Session.code(CREWS.other.lead.phone);
    const reply = await outsider.raw<DocumentRecord[]>(
      'GET',
      `/documents?projectId=${sale.project.id}`,
    );
    const seen = reply.status === 200 ? reply.body.map((doc) => doc.id) : [];
    expect(seen).not.toContain(mine.bill);
    const file = await outsider.raw('GET', `/documents/${mine.bill}/file`);
    expect([403, 404]).toContain(file.status);
  });
});
