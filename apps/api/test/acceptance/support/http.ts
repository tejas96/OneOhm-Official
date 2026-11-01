/**
 * A signed-in person talking to the acceptance API on port 4300: staff with a password
 * (session cookie + CSRF header), staff or crew with a sign-in code (bearer token), or a
 * customer with a code. Failed calls throw with the request and the answer, so a failing
 * scenario says exactly which call broke.
 */
export const API = process.env.ACCEPTANCE_API_URL ?? 'http://localhost:4300/v1';
export const OTP_CODE = '123456';
export const ADMIN = { identifier: 'admin@oneohm.local', password: 'OneOhm@2026' };

export interface Reply<T> {
  readonly status: number;
  readonly body: T;
  readonly text: string;
  readonly headers: Headers;
}

export class ApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly text: string,
  ) {
    super(`${method} ${path} → ${status} ${text.slice(0, 600)}`);
  }
}

type Body = unknown;

export class Session {
  private readonly cookies = new Map<string, string>();
  private token: string | null = null;
  userId = '';
  name = '';

  /** Web sign-in with email or employee ID and password. */
  static async password(identifier: string, password: string): Promise<Session> {
    const session = new Session();
    const signed = await session.post<{ user: { id: string; fullName: string } }>('/auth/sign-in', {
      identifier,
      password,
    });
    session.userId = signed.user.id;
    session.name = signed.user.fullName;
    return session;
  }

  static admin(): Promise<Session> {
    return Session.password(ADMIN.identifier, ADMIN.password);
  }

  /** Mobile sign-in with a code: staff, crews and resellers (`/auth`) or customers. */
  static async code(phone: string, who: 'staff' | 'customer' = 'staff'): Promise<Session> {
    const base = who === 'customer' ? '/customer/auth' : '/auth';
    const session = new Session();
    await session.post(`${base}/otp`, { phone });
    const verified = await session.post<{
      token: string;
      user?: { id: string; fullName: string };
      customer?: { id: string; fullName?: string; name?: string };
    }>(`${base}/otp/verify`, { phone, code: OTP_CODE });
    session.token = verified.token;
    session.userId = verified.user?.id ?? verified.customer?.id ?? '';
    session.name = verified.user?.fullName ?? verified.customer?.name ?? '';
    return session;
  }

  private headers(json: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    if (json) headers['content-type'] = 'application/json';
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
      headers['x-oneohm-csrf'] = this.cookies.get('oneohm_csrf') ?? '';
    }
    return headers;
  }

  /** Any call; never throws on an error status. */
  async raw<T = unknown>(method: string, path: string, body?: Body): Promise<Reply<T>> {
    const form = body instanceof FormData;
    const init: RequestInit = { method, headers: this.headers(!form && body !== undefined) };
    if (body !== undefined) init.body = form ? body : JSON.stringify(body);
    const res = await fetch(API + path, init);
    for (const raw of res.headers.getSetCookie()) {
      const [pair = ''] = raw.split(';');
      const at = pair.indexOf('=');
      this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const type = res.headers.get('content-type') ?? '';
    const text = type.includes('json') || type.startsWith('text') ? await res.text() : '';
    const parsed = type.includes('json') && text ? (JSON.parse(text) as T) : (text as T);
    return { status: res.status, body: parsed, text, headers: res.headers };
  }

  /** A file download: status, type and size. */
  async download(
    path: string,
    body?: Body,
  ): Promise<{ status: number; type: string; bytes: Buffer }> {
    const init: RequestInit = {
      method: body ? 'POST' : 'GET',
      headers: this.headers(Boolean(body)),
    };
    if (body) init.body = JSON.stringify(body);
    const res = await fetch(API + path, init);
    const bytes = Buffer.from(await res.arrayBuffer());
    return { status: res.status, type: res.headers.get('content-type') ?? '', bytes };
  }

  private async ok<T>(method: string, path: string, body?: Body): Promise<T> {
    const reply = await this.raw<T>(method, path, body);
    if (reply.status >= 400) throw new ApiError(method, path, reply.status, reply.text);
    return reply.body;
  }

  get<T = unknown>(path: string): Promise<T> {
    return this.ok<T>('GET', path);
  }
  post<T = unknown>(path: string, body: Body = {}): Promise<T> {
    return this.ok<T>('POST', path, body);
  }
  put<T = unknown>(path: string, body: Body = {}): Promise<T> {
    return this.ok<T>('PUT', path, body);
  }
  patch<T = unknown>(path: string, body: Body = {}): Promise<T> {
    return this.ok<T>('PATCH', path, body);
  }
  del<T = unknown>(path: string): Promise<T> {
    return this.ok<T>('DELETE', path);
  }
}

/** Builds a query string, leaving out empty values. */
export function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
