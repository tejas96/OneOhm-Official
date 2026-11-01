import { Inject, Injectable } from '@nestjs/common';
import type { Skill, SkillInput } from '@oneohm/api-contracts';
import { skills, userSkills, users } from '@oneohm/database';
import { asc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

/** "Licensed wireman" → "licensed_wireman": the key never changes after this. */
const keyOf = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

/** The skills the business tracks (PRD 3.7, 7.4), edited in Settings → Workforce. */
@Injectable()
export class SkillsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<Skill[]> {
    const rows = await this.db
      .select({
        skill: skills,
        people: sql<number>`(select count(*)::int from ${userSkills} join ${users} on ${users.id} = ${userSkills.userId} where ${userSkills.skillKey} = ${skills.key} and ${users.status} = 'active')`,
      })
      .from(skills)
      .orderBy(asc(skills.position), asc(skills.name));
    return rows.map(({ skill, people }) => ({
      key: skill.key,
      name: skill.name,
      description: skill.description,
      active: skill.active,
      position: skill.position,
      people,
    }));
  }

  async create(actor: Actor, input: SkillInput): Promise<Skill> {
    assertCan(actor, 'settings.manage', 'people.manage');
    const key = keyOf(input.name);
    if (key.length < 2) throw invalid('Use letters in the name.', { name: 'Too short.' });
    const [last] = await this.db
      .select({ position: sql<number>`coalesce(max(${skills.position}), -1)::int` })
      .from(skills);
    const inserted = await this.db
      .insert(skills)
      .values({
        key,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        position: (last?.position ?? -1) + 1,
      })
      .onConflictDoNothing()
      .returning({ key: skills.key });
    if (inserted.length === 0) throw conflict('A skill with this name already exists.', 'exists');
    await recordAudit(this.db, actor.userId, 'skill.created', 'skill', key, { name: input.name });
    return this.one(key);
  }

  async update(
    actor: Actor,
    key: string,
    patch: {
      name?: string | undefined;
      description?: string | undefined;
      active?: boolean | undefined;
    },
  ): Promise<Skill> {
    assertCan(actor, 'settings.manage', 'people.manage');
    const updated = await this.db
      .update(skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        updatedAt: new Date(),
      })
      .where(eq(skills.key, key))
      .returning({ key: skills.key });
    if (updated.length === 0) throw notFound('That skill');
    await recordAudit(this.db, actor.userId, 'skill.updated', 'skill', key, patch);
    return this.one(key);
  }

  private async one(key: string): Promise<Skill> {
    const found = (await this.list()).find((skill) => skill.key === key);
    if (!found) throw notFound('That skill');
    return found;
  }
}
