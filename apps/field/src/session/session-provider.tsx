import type { CurrentUser } from '@oneohm/api-contracts';
import type { Capability } from '@oneohm/domain';
import { ApiError, NetworkError, registeredPushToken, unwrap } from '@oneohm/mobile-ui';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, onSessionExpired, queryClient, setToken, tokenStore } from '@/api/api';

export type SessionState =
  | { readonly status: 'restoring' }
  | { readonly status: 'signedOut' }
  /** A saved session exists but OneOhm could not be reached to confirm it. */
  | { readonly status: 'unreachable' }
  | { readonly status: 'signedIn'; readonly user: CurrentUser };

interface SessionContextValue {
  readonly state: SessionState;
  readonly signIn: (token: string, user: CurrentUser) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly retry: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Restores the saved session at launch and signs out everywhere on a 401. */
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
      const user = await unwrap(api.auth.me());
      setState({ status: 'signedIn', user });
    } catch (error) {
      if (error instanceof NetworkError) setState({ status: 'unreachable' });
      else if (error instanceof ApiError && error.status === 401) await clear();
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
      signIn: async (token, user) => {
        setToken(token);
        await tokenStore.write(token);
        setState({ status: 'signedIn', user });
      },
      signOut: async () => {
        try {
          const phone = registeredPushToken();
          if (phone) await api.notifications.forgetDevice({ body: { token: phone } });
          await api.auth.signOut();
        } catch {
          // Signing out locally is enough when the server cannot be reached.
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

/** The signed-in person. Only call inside the signed-in routes. */
export function useCurrentUser(): CurrentUser {
  const { state } = useSession();
  if (state.status !== 'signedIn') throw new Error('No signed-in person.');
  return state.user;
}

/** True when the person holds at least one of the capabilities. */
export function useCan(...capabilities: Capability[]): boolean {
  const user = useCurrentUser();
  return capabilities.some((capability) => user.capabilities.includes(capability));
}
