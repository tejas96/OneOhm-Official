import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId, updatedAt, version } from './columns';
import { roleKindEnum, sessionClientEnum, userStatusEnum } from './enums';

/** One identity per person, whatever roles they hold (PRD 3.2). */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    fullName: text('full_name').notNull(),
    email: text('email'),
    employeeCode: text('employee_code'),
    phoneE164: text('phone_e164'),
    /** scrypt hash; web sign-in. Mobile users may have none (OTP only). */
    passwordHash: text('password_hash'),
    designation: text('designation'),
    status: userStatusEnum('status').notNull().default('active'),
    onLeave: boolean('on_leave').notNull().default(false),
    avatarSwatch: integer('avatar_swatch').notNull().default(0),
    lastActiveAt: instant('last_active_at'),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    uniqueIndex('users_employee_code_unique').on(table.employeeCode),
    uniqueIndex('users_phone_unique').on(table.phoneE164),
  ],
);

/** Business roles are data: owners add, rename and archive them (PRD 7.3). */
export const roles = pgTable(
  'roles',
  {
    id: primaryId(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    kind: roleKindEnum('kind').notNull(),
    description: text('description').notNull().default(''),
    system: boolean('system').notNull().default(false),
    archivedAt: instant('archived_at'),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('roles_key_unique').on(table.key)],
);

export const roleCapabilities = pgTable(
  'role_capabilities',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    capability: text('capability').notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.capability] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index('user_roles_role_idx').on(table.roleId),
  ],
);

/** Sessions store only a hash of the token the client holds. */
export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    client: sessionClientEnum('client').notNull(),
    expiresAt: instant('expires_at').notNull(),
    lastSeenAt: instant('last_seen_at').notNull().defaultNow(),
    revokedAt: instant('revoked_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('sessions_token_unique').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
  ],
);

/** One-time codes for mobile sign-in; only a hash is kept. */
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: primaryId(),
    phoneE164: text('phone_e164').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: instant('expires_at').notNull(),
    consumedAt: instant('consumed_at'),
    createdAt: createdAt(),
  },
  (table) => [index('otp_phone_idx').on(table.phoneE164)],
);
