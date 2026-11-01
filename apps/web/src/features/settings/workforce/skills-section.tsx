'use client';

import type { Skill } from '@oneohm/api-contracts';
import { Button, EmptyState, IconButton, Switch, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton } from '@/components/query-state';
import { SKILLS_KEY, useSkills } from '@/features/team/skills/use-skills';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { SettingsSection } from '../settings-section';
import { SkillDialog } from './skill-dialog';

/**
 * Skills people hold (ticked on each person in Team) and task templates can ask for.
 * Assignment prefers someone in the role with the skill (PRD 3.7). Each change saves.
 */
export function SkillsSection() {
  const t = useTranslations('settings.workforce.skills');
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useSkills();
  // undefined: closed; null: a new skill.
  const [editing, setEditing] = useState<Skill | null | undefined>(undefined);
  const [switching, setSwitching] = useState<string | null>(null);

  const setActive = async (skill: Skill, active: boolean) => {
    setSwitching(skill.key);
    try {
      await expectStatus(
        api.skills.updateSkill({ params: { key: skill.key }, body: { active } }),
        200,
      );
      await queryClient.invalidateQueries({ queryKey: SKILLS_KEY });
    } catch (error) {
      toast({ title: t('failed'), description: describeError(error), tone: 'error' });
    } finally {
      setSwitching(null);
    }
  };

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      {query.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {query.data && query.data.length === 0 && (
        <EmptyState icon={<GraduationCap />} title={t('emptyTitle')} />
      )}
      {query.data && query.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline bg-raised">
          {query.data.map((skill) => (
            <li key={skill.key} className="flex items-center gap-2 py-1 pr-2 pl-4">
              <Switch
                className="min-w-0 flex-1"
                checked={skill.active}
                disabled={switching === skill.key}
                onCheckedChange={(active) => setActive(skill, active)}
                label={skill.name}
                description={t('summary', { people: skill.people, about: skill.description })}
              />
              <IconButton
                size="sm"
                label={t('edit', { name: skill.name })}
                onClick={() => setEditing(skill)}
              >
                <Pencil aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body-sm text-ink-faint">{t('hint')}</p>
        <Button size="sm" leadingIcon={<Plus />} onClick={() => setEditing(null)}>
          {t('add')}
        </Button>
      </div>
      <SkillDialog
        open={editing !== undefined}
        skill={editing ?? null}
        onClose={() => setEditing(undefined)}
      />
    </SettingsSection>
  );
}
