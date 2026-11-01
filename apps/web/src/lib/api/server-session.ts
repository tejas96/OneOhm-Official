import 'server-only';
import type { CurrentUser } from '@oneohm/api-contracts';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './contract';

const API = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4200';

/** The signed-in person for a server-rendered page, or null when the session is not valid. */
export async function currentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE)?.value;
  if (!session) return null;
  try {
    const response = await fetch(`${API}/v1/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
      cache: 'no-store',
    });
    return response.ok ? ((await response.json()) as CurrentUser) : null;
  } catch {
    return null;
  }
}
