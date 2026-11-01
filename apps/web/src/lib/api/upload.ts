'use client';

import type {
  CompanyAssets,
  DocumentRecord,
  MaterialSlip,
  OrderDcrPapers,
  Product,
} from '@oneohm/api-contracts';
import type { CompanyAssetKind } from '@oneohm/domain';
import { networkError, toApiError } from './api-error';
import { CSRF_COOKIE, CSRF_HEADER } from './contract';

function csrfToken(): string | null {
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === CSRF_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Multipart upload with progress (fetch cannot report upload progress, so this uses
 * XMLHttpRequest). Same origin, cookie session, CSRF header — like every other call.
 */
function send<T>(
  path: string,
  file: File,
  fields: Readonly<Record<string, string | undefined>>,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value) form.append(key, value);
  form.append('file', file, file.name);
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `/api/v1${path}`);
    request.withCredentials = true;
    const token = csrfToken();
    if (token) request.setRequestHeader(CSRF_HEADER, token);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onerror = () => reject(networkError());
    request.onload = () => {
      let body: unknown = null;
      try {
        body = request.responseText ? JSON.parse(request.responseText) : null;
      } catch {
        body = null;
      }
      if (request.status === 201) {
        resolve(body as T);
        return;
      }
      if (request.status === 401) {
        window.location.assign(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
      }
      reject(toApiError(request.status, body));
    };
    request.send(form);
  });
}

export interface UploadLinks {
  readonly category: string;
  readonly projectId?: string;
  readonly taskId?: string;
  readonly customerId?: string;
  readonly propertyId?: string;
  readonly leadId?: string;
  readonly contractorId?: string;
  readonly vendorId?: string;
  readonly name?: string;
}

export const uploadDocument = (
  file: File,
  links: UploadLinks,
  onProgress?: (fraction: number) => void,
) => send<DocumentRecord>('/documents', file, { ...links }, onProgress);

export const replaceDocument = (id: string, file: File, onProgress?: (fraction: number) => void) =>
  send<DocumentRecord>(`/documents/${id}/replace`, file, {}, onProgress);

export const uploadCompanyAsset = (kind: CompanyAssetKind, file: File) =>
  send<CompanyAssets>(`/settings/company/assets/${kind}`, file, {});

/** A photo of material handed to (or back from) a contractor, kept with the project. */
export const uploadSlipPhoto = (slipId: string, file: File) =>
  send<MaterialSlip>(`/material-slips/${slipId}/photo`, file, {});

/** The panel maker's DCR certificate for a goods receipt, filed with the documents. */
export const uploadDcrCertificate = (receiptId: string, file: File) =>
  send<OrderDcrPapers>(`/inventory/receipts/${receiptId}/dcr-certificate`, file, {});

/** The maker's datasheet for a catalog product (Settings → Products). */
export const uploadProductDatasheet = (productId: string, file: File) =>
  send<Product>(`/catalog/products/${productId}/datasheet`, file, {});

/** Where the browser reads a document (the API checks access on every request). */
export const documentUrl = (id: string, disposition: 'inline' | 'attachment' = 'inline') =>
  `/api/v1/documents/${id}/file?disposition=${disposition}`;

/**
 * A photo's small preview (WebP, 400 px) for tiles and galleries; the original stays on
 * `documentUrl` for viewing and downloading. Files without one come back as they are.
 */
export const documentThumbUrl = (id: string) => `/api/v1/documents/${id}/thumbnail`;
