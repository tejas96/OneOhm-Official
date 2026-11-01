import type { CustomerProfile } from '@oneohm/api-contracts';
import { ApiError, NetworkError, unwrap } from '@oneohm/mobile-ui';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, keys, onSessionExpired, queryClient, setToken, tokenStore } from '@/api/api';

export type SessionState =
  | { readonly status: 'restoring' }
  | { readonly status: 'signedOut' }
  /** A saved session exists but OneOhm could not be reached to confirm it. */
  | { readonly status: 'unreachable' }
  | { readonly status: 'signedIn'; readonly customer: CustomerProfile };

interface SessionContextValue {
  readonly state: SessionState;
  readonly signIn: (token: string, customer: CustomerProfile) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly retry: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Restores the saved session at launch (the home call proves it) and clears it on a 401. */
export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'restoring' });

  const clear = useCallback(async () => {
    setToken(null);
    await tokenStore.clear();
    queryClient.clear();
    setState({ status: 'signedOut' });
  }, []);

  const restore = useCallback(async () => {
    setState({ status: 'restoring' });
    const saved = await tokenStore.read();
    if (!saved) {
      setState({ status: 'signedOut' });
      return;
    }
    setToken(saved);
    try {
      const home = await unwrap(api.customer.home());
      queryClient.setQueryData(keys.home, home);
      setState({ status: 'signedIn', customer: home.customer });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await clear();
      else if (error instanceof NetworkError) setState({ status: 'unreachable' });
      else setState({ status: 'unreachable' });
    }
  }, [clear]);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => onSessionExpired(() => void clear()), [clear]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      retry: () => void restore(),
      signIn: async (token, customer) => {
        setToken(token);
        await tokenStore.write(token);
        setState({ status: 'signedIn', customer });
      },
      signOut: async () => {
        try {
          await api.customer.signOut();
        } catch {
          // Signing out on the phone is enough when OneOhm cannot be reached.
        } finally {
          await clear();
        }
      },
    }),
    [state, clear, restore],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider.');
  return value;
}

/** The signed-in customer. Only call inside the signed-in routes. */
export function useCustomer(): CustomerProfile {
  const { state } = useSession();
  if (state.status !== 'signedIn') throw new Error('No signed-in customer.');
  return state.customer;
}
