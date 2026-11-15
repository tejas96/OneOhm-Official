import { type DatabaseExecutor, marketingConnections } from '@oneohm/database';
import type { AdProvider } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type {
  GoogleAccess,
  GoogleDetails,
  GoogleSecrets,
  MetaAccess,
  MetaDetails,
  MetaSecrets,
} from './access';
import { openSecrets, sealSecrets } from './secrets';

export type ConnectionRow = typeof marketingConnections.$inferSelect;

/** A practice connection made in sandbox mode; live mode never treats it as connected. */
export const isPracticeRow = (row: Pick<ConnectionRow, 'details'> | null | undefined): boolean =>
  Boolean((row?.details as { sandbox?: boolean } | undefined)?.sandbox);

/**
 * The connection row. With `mode`, a row made in the other mode reads as none: practice rows
 * never count in live mode (their keys are public), and live rows are left alone in practice.
 */
export async function readConnection(
  db: DatabaseExecutor,
  provider: AdProvider,
  mode?: 'live' | 'sandbox',
): Promise<ConnectionRow | null> {
  const [row] = await db
    .select()
    .from(marketingConnections)
    .where(eq(marketingConnections.provider, provider));
  if (!row) return null;
  if (mode && isPracticeRow(row) !== (mode === 'sandbox')) return null;
  return row;
}

/** Every connection row that belongs to this mode. */
export async function connectionsFor(
  db: DatabaseExecutor,
  mode: 'live' | 'sandbox',
): Promise<ConnectionRow[]> {
  const rows = await db.select().from(marketingConnections);
  return rows.filter((row) => isPracticeRow(row) === (mode === 'sandbox'));
}

/** A connection that can run ads: connected (or partly approved), with an account picked. */
const usable = (
  row: ConnectionRow | null,
): row is ConnectionRow & { accountId: string; secrets: string } =>
  Boolean(
    row?.secrets &&
      row.accountId &&
      !isPracticeRow(row) &&
      (row.status === 'connected' || row.status === 'in_review'),
  );

/** Meta's decrypted access, or null when Meta is not connected. */
export async function metaAccess(db: DatabaseExecutor, key: string): Promise<MetaAccess | null> {
  const row = await readConnection(db, 'meta');
  if (!usable(row)) return null;
  const secrets = openSecrets<MetaSecrets>(key, row.secrets);
  return {
    userToken: secrets.userToken,
    pageToken: secrets.pageToken,
    adAccountId: row.accountId,
    currency: row.currency ?? 'INR',
    details: row.details as MetaDetails,
  };
}

/** Google's decrypted access, or null when Google is not connected. */
export async function googleAccess(
  db: DatabaseExecutor,
  key: string,
): Promise<GoogleAccess | null> {
  const row = await readConnection(db, 'google');
  if (!usable(row)) return null;
  const secrets = openSecrets<GoogleSecrets>(key, row.secrets);
  return {
    refreshToken: secrets.refreshToken,
    customerId: row.accountId,
    currency: row.currency ?? 'INR',
    details: row.details as GoogleDetails,
  };
}

/** The fields of a connection that change; `secrets` is sealed before it is stored. */
export interface ConnectionChange {
  readonly status?: ConnectionRow['status'];
  readonly secrets?: MetaSecrets | GoogleSecrets | null;
  readonly accountId?: string | null;
  readonly accountName?: string | null;
  readonly currency?: string | null;
  readonly details?: MetaDetails | GoogleDetails;
  readonly missing?: readonly string[];
  readonly tokenExpiresAt?: Date | null;
  readonly lastError?: string | null;
  readonly balancePaise?: number | null;
  readonly balanceCheckedAt?: Date | null;
  readonly connectedByUserId?: string | null;
  readonly connectedAt?: Date | null;
}

/** Creates or changes the row; `details` merges over what is saved. */
export async function saveConnection(
  db: DatabaseExecutor,
  key: string,
  provider: AdProvider,
  change: ConnectionChange,
): Promise<void> {
  const existing = await readConnection(db, provider);
  const { secrets, details, missing, ...rest } = change;
  const values = {
    ...rest,
    ...(secrets !== undefined ? { secrets: secrets ? sealSecrets(key, secrets) : null } : {}),
    ...(details !== undefined
      ? { details: { ...((existing?.details as object) ?? {}), ...details } }
      : {}),
    ...(missing !== undefined ? { missing: [...missing] } : {}),
    updatedAt: new Date(),
  };
  await db
    .insert(marketingConnections)
    .values({ provider, status: change.status ?? existing?.status ?? 'disconnected', ...values })
    .onConflictDoUpdate({ target: marketingConnections.provider, set: values });
}
