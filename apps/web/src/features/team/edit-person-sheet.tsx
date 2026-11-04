'use client';

import type { Person, Role } from '@oneohm/api-contracts';
import { Button, Sheet, Switch, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { UserRoundMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useWorkforceSettings } from '@/features/settings/workforce/use-workforce-settings';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useCurrentUser } from '@/providers/current-user';
import {
  PersonWorkFields,
  type WorkDraft,
  workBodyFrom,
  workDraftFrom,
} from './capacity/person-work-fields';
import { bodyFrom, draftFrom, EMPTY_PERSON, PersonFields } from './person-fields';
import { RequireNewPassword } from './require-new-password';
import { SkillsPicker } from './skills/skills-picker';
import { PEOPLE_KEY, ROLES_KEY } from './use-team';

/** Details, roles, leave and sign-in for one person; Remove from team starts the handover. */
export function EditPersonSheet({
  person,
  roles,
  onClose,
  onRemove,
}: {
  readonly person: Person | null;
  readonly roles: readonly Role[];
  readonly onClose: () => void;
  /** Opens the removal sheet for this person (spec Flow 5). */
  readonly onRemove: (person: Person) => void;
}) {
  const t = useTranslations('team.editSheet');
  const formId = useId();
  const toast = useToast();
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [draft, setDraft] = useState(EMPTY_PERSON);
  const [onLeave, setOnLeave] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [work, setWork] = useState<WorkDraft>({ limit: '', tracking: 'follow' });
  const settings = useWorkforceSettings(person !== null);
  const companyLimit = settings.data?.policy.capacity.defaultOpenTaskLimit || null;
  const { reset } = form;

  useEffect(() => {
    if (!person) return;
    setDraft(draftFrom(person));
    setOnLeave(person.onLeave);
    setSkills(person.skills);
    setWork(workDraftFrom(person));
    reset();
  }, [person, reset]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!person) return;
    const body = {
      ...bodyFrom(draft),
      onLeave,
      skills,
      ...workBodyFrom(work),
    } as const;
    await form.run(
      () => expectStatus(api.people.updatePerson({ params: { id: person.id }, body }), 200),
      async (saved) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: PEOPLE_KEY }),
          queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
        ]);
        toast({ title: t('saved'), reference: saved.fullName, tone: 'success' });
        onClose();
      },
    );
  };

  return (
    <Sheet
      open={person !== null}
      onOpenChange={(open) => !open && onClose()}
      title={person?.fullName ?? t('title')}
      description={person?.roles.map((role) => role.name).join(' · ')}
      width="lg"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-8 px-5 py-6 sm:px-6"
      >
        <section className="flex flex-col gap-4">
          <h3 className="type-overline text-ink-faint uppercase">{t('details')}</h3>
          <PersonFields draft={draft} onChange={setDraft} roles={roles} errors={form.fieldErrors} />
        </section>
        <section className="flex flex-col gap-2 border-t border-hairline pt-6">
          <h3 className="type-overline text-ink-faint uppercase">{t('skills')}</h3>
          <p className="type-body-sm text-ink-faint">{t('skillsHint')}</p>
          <SkillsPicker value={skills} onChange={setSkills} error={form.fieldErrors.skills} />
        </section>
        <section className="flex flex-col gap-4 border-t border-hairline pt-6">
          <h3 className="type-overline text-ink-faint uppercase">{t('workTitle')}</h3>
          <PersonWorkFields
            draft={work}
            onChange={setWork}
            companyLimit={companyLimit}
            errors={form.fieldErrors}
          />
        </section>
        <section className="flex flex-col gap-1 border-t border-hairline pt-6">
          <h3 className="mb-2 type-overline text-ink-faint uppercase">{t('access')}</h3>
          <Switch
            checked={onLeave}
            onCheckedChange={setOnLeave}
            label={t('onLeave')}
            description={t('onLeaveHint')}
          />
          {person && (
            <div className="mt-3 flex flex-col">
              <RequireNewPassword person={person} />
            </div>
          )}
        </section>
        {/* Nobody removes themselves (spec Flow 5): another admin does it. */}
        {person && person.id !== me.id && (
          <section className="flex flex-col gap-3 border-t border-hairline pt-6">
            <div className="flex flex-col gap-1">
              <h3 className="type-overline text-ink-faint uppercase">{t('leaving')}</h3>
              <p className="type-body-sm text-ink-faint">{t('leavingHint')}</p>
            </div>
            <Button
              variant="danger"
              leadingIcon={<UserRoundMinus />}
              onClick={() => onRemove(person)}
              className="self-start"
            >
              {t('remove')}
            </Button>
          </section>
        )}
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
