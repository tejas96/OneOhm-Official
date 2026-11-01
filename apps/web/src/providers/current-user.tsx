'use client';

import type { CurrentUser } from '@oneohm/api-contracts';
import type { Capability } from '@oneohm/domain';
import { createContext, type ReactNode, useContext } from 'react';

const CurrentUserContext = createContext<CurrentUser | null>(null);

export function CurrentUserProvider({
  user,
  children,
}: {
  readonly user: CurrentUser;
  readonly children: ReactNode;
}) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

/** The signed-in person; only inside the signed-in app. */
export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error('useCurrentUser outside the signed-in app.');
  return user;
}

/** Whether the signed-in person holds any of the capabilities (hides what they cannot use). */
export function useCan(...capabilities: Capability[]): boolean {
  const user = useCurrentUser();
  return capabilities.some((capability) => user.capabilities.includes(capability));
}
