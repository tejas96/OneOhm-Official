'use client';

import type { Person } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  Input,
  ResponsiveTable,
  Select,
  type TableColumn,
} from '@oneohm/design-system/web';
import { Search, UserPlus, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { AddPersonDialog } from './add-person-dialog';
import { LoadCell } from './capacity/overload-badge';
import { EditPersonSheet } from './edit-person-sheet';
import { PersonContact, PersonIdentity, PersonRoles, PersonStatus } from './person-row';
import { usePeople, useRoles } from './use-team';

const ALL = 'all';

function matches(person: Person, search: string, roleId: string): boolean {
  if (roleId !== ALL && !person.roles.some((role) => role.id === roleId)) return false;
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [person.fullName, person.email, person.phone, person.employeeCode, person.designation]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

/** Everyone on the team with their roles, contact and current load. */
export function PeopleTab() {
  const t = useTranslations('team');
  const canManage = useCan('people.manage');
  const people = usePeople();
  const roles = useRoles();
  const [search, setSearch] = useState('');
  const [roleId, setRoleId] = useState<string>(ALL);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const visible = useMemo(
    () => (people.data ?? []).filter((person) => matches(person, search, roleId)),
    [people.data, search, roleId],
  );
  const editing = people.data?.find((person) => person.id === editingId) ?? null;
  const roleOptions = [
    { value: ALL, label: t('allRoles') },
    ...(roles.data ?? [])
      .filter((role) => !role.archived)
      .map((role) => ({ value: role.id, label: role.name })),
  ];

  const columns: readonly TableColumn<Person>[] = [
    {
      key: 'person',
      header: t('columns.person'),
      primary: true,
      cell: (person) => (
        <PersonIdentity
          person={person}
          onOpen={canManage ? () => setEditingId(person.id) : undefined}
        />
      ),
    },
    { key: 'roles', header: t('columns.roles'), cell: (person) => <PersonRoles person={person} /> },
    {
      key: 'contact',
      header: t('columns.contact'),
      cell: (person) => <PersonContact person={person} />,
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (person) => <PersonStatus person={person} manage={canManage} />,
    },
    {
      key: 'load',
      header: t('columns.load'),
      align: 'end',
      cell: (person) => (
        <LoadCell open={person.openTasks} limit={person.openTaskLimit} state={person.loadState} />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:max-w-md sm:flex-1">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            leading={<Search aria-hidden className="size-4" />}
          />
        </div>
        <Select
          value={roleId}
          onValueChange={setRoleId}
          options={roleOptions}
          label={t('roleFilter')}
          className="sm:w-56"
        />
        {people.data && (
          <p className="type-body-sm text-ink-faint sm:ml-auto">
            {t('count', { count: visible.length })}
          </p>
        )}
        {canManage && (
          <Button
            variant="primary"
            leadingIcon={<UserPlus />}
            onClick={() => setAdding(true)}
            disabled={!roles.data}
            className="self-start sm:self-auto"
          >
            {t('add')}
          </Button>
        )}
      </div>
      {people.isPending && <ListSkeleton label={t('loading')} />}
      {people.isError && <LoadError error={people.error} onRetry={() => people.refetch()} />}
      {people.data && visible.length === 0 && (
        <EmptyState icon={<UsersRound />} title={t('emptyTitle')} description={t('emptyBody')} />
      )}
      {visible.length > 0 && (
        <ResponsiveTable
          caption={t('title')}
          columns={columns}
          rows={visible}
          rowKey={(person) => person.id}
        />
      )}
      {roles.data && (
        <>
          <AddPersonDialog open={adding} onOpenChange={setAdding} roles={roles.data} />
          <EditPersonSheet person={editing} roles={roles.data} onClose={() => setEditingId(null)} />
        </>
      )}
    </div>
  );
}
