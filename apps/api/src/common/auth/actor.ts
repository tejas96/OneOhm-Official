import type { CurrentUser } from '@oneohm/api-contracts';
import type { Capability, RoleKind } from '@oneohm/domain';
import { forbidden } from '../http/errors';

/** The signed-in person making a request. */
export interface Actor {
  readonly userId: string;
  readonly sessionId: string;
  readonly fullName: string;
  readonly kind: RoleKind;
  readonly roleKeys: readonly string[];
  readonly capabilities: ReadonlySet<Capability>;
  readonly user: CurrentUser;
  readonly via: 'cookie' | 'bearer';
}

export function can(actor: Actor, capability: Capability): boolean {
  return actor.capabilities.has(capability);
}

/** Throws 403 unless the actor holds at least one of the capabilities. */
export function assertCan(actor: Actor, ...capabilities: Capability[]): void {
  if (!capabilities.some((capability) => actor.capabilities.has(capability))) throw forbidden();
}
