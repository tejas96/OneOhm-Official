'use client';

import type { Person } from '@oneohm/api-contracts';
import { Avatar, Badge, StatusPill } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { awaitsSignIn, InviteBadge, InviteMenu } from './invite-status';
import { LeftTag } from './left-tag';
import { useSkills } from './skills/use-skills';

/** +919876543210 → +91 98765 43210 */
export function formatPhone(phone: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}

/** The same person keeps the same avatar colour on every tab. */
export const swatchOf = (id: string) =>
  [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 6;

export function PersonIdentity({
  person,
  onOpen,
}: {
  readonly person: Person;
  readonly onOpen?: (() => void) | undefined;
}) {
  const t = useTranslations('team');
  const subtitle = [person.designation, person.employeeCode].filter(Boolean).join(' · ');
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={person.fullName} swatch={swatchOf(person.id)} size="md" />
      <span className="flex min-w-0 flex-col">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={t('edit', { name: person.fullName })}
            className="oh-stretched-link truncate text-left type-body font-medium text-ink hover:text-accent"
          >
            {person.fullName}
          </button>
        ) : (
          <span className="truncate type-body font-medium text-ink">{person.fullName}</span>
        )}
        {subtitle && <span className="truncate type-body-sm text-ink-faint">{subtitle}</span>}
      </span>
    </span>
  );
}

export function PersonRoles({ person }: { readonly person: Person }) {
  const t = useTranslations('team');
  const skills = useSkills();
  const names = person.skills
    .map((key) => skills.data?.find((skill) => skill.key === key)?.name)
    .filter((name): name is string => Boolean(name));
  if (person.roles.length === 0) return <span className="text-ink-faint">{t('noRole')}</span>;
  return (
    <span className="flex flex-col items-end gap-1 md:items-start">
      <span className="flex flex-wrap justify-end gap-1 md:justify-start">
        {person.roles.map((role) => (
          <Badge key={role.id} variant={role.kind === 'staff' ? 'soft' : 'accent'}>
            {role.name}
          </Badge>
        ))}
      </span>
      {names.length > 0 && (
        <span className="type-label text-ink-faint">
          {t('skills.list', { names: names.join(', ') })}
        </span>
      )}
    </span>
  );
}

export function PersonContact({ person }: { readonly person: Person }) {
  return (
    <span className="flex min-w-0 flex-col">
      {person.email && <span className="truncate type-body-sm text-ink">{person.email}</span>}
      {person.phone && (
        <span className="font-mono text-[0.8125rem] text-ink-muted">
          {formatPhone(person.phone)}
        </span>
      )}
    </span>
  );
}

/** Active, on leave or left (with the day); then, until their first sign-in, the invite. */
export function PersonStatus({
  person,
  manage = false,
}: {
  readonly person: Person;
  /** Offer "Send invite again" and "Copy invite text" (needs `people.manage`). */
  readonly manage?: boolean;
}) {
  const t = useTranslations('team.status');
  const status =
    person.status === 'inactive' ? (
      <LeftTag leftOn={person.leftOn} />
    ) : person.onLeave ? (
      <StatusPill tone="waiting" label={t('onLeave')} size="sm" />
    ) : (
      <StatusPill tone="onTrack" label={t('active')} size="sm" />
    );
  if (!awaitsSignIn(person)) return status;
  return (
    <span className="flex flex-col items-end gap-1.5 md:items-start">
      {status}
      <span className="flex items-center gap-0.5">
        <InviteBadge person={person} />
        {manage && <InviteMenu person={person} />}
      </span>
    </span>
  );
}
