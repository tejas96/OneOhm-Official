import { apiErrorFrom, NetworkError } from './api-error';

/** A picked file: on phones a local `uri`; on the web preview also the browser `file`. */
export interface UploadableFile {
  readonly uri: string;
  readonly name: string;
  readonly type: string;
  readonly file?: Blob;
}

export interface UploadRequest {
  /** Full URL, e.g. `${baseUrl}/v1/documents`. */
  readonly url: string;
  readonly token: string | null;
  readonly file: UploadableFile;
  readonly fields: Readonly<Record<string, string | undefined>>;
  readonly onProgress?: (fraction: number) => void;
  /** How long the whole upload may take; a video on a weak signal needs longer. */
  readonly timeoutMs?: number | undefined;
}

const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Multipart upload with progress (fetch cannot report upload progress, so this uses
 * XMLHttpRequest, which React Native and browsers both provide). Resolves with the
 * JSON body of a 2xx answer; anything else rejects with an `ApiError`.
 */
export function uploadFile<T>({
  url,
  token,
  file,
  fields,
  onProgress,
  timeoutMs = UPLOAD_TIMEOUT_MS,
}: UploadRequest): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value) form.append(key, value);
  if (file.file) form.append('file', file.file, file.name);
  else form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);

  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.timeout = timeoutMs;
    request.setRequestHeader('accept', 'application/json');
    if (token) request.setRequestHeader('authorization', `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    request.onerror = () => reject(new NetworkError());
    request.ontimeout = () => reject(new NetworkError());
    request.onload = () => {
      let body: unknown;
      try {
        body = request.responseText ? JSON.parse(request.responseText) : undefined;
      } catch {
        body = undefined;
      }
      if (request.status >= 200 && request.status < 300) resolve(body as T);
      else reject(apiErrorFrom(request.status, body));
    };
    request.send(form);
  });
}
