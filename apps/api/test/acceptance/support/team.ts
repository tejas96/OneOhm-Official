import type { Session } from './http';
import { setWebPassword } from './password';

/**
 * The standing OneOhm team in the acceptance database: one person for every in-house
 * role, two crew companies and two resellers. Created once per run by the global setup;
 * scenarios look people up by phone. Scenarios that change a person (leave, rewards)
 * create their own people instead, so the shared team stays predictable.
 */
export const STAFF = {
  sales: { phone: '+917000000101', name: 'Sneha Patil (test)', roles: ['sales'] },
  execution: { phone: '+917000000102', name: 'Vikram Jadhav (test)', roles: ['execution'] },
  liaisoning: { phone: '+917000000103', name: 'Neha Kulkarni (test)', roles: ['liaisoning'] },
  loan: { phone: '+917000000104', name: 'Rahul Deshmukh (test)', roles: ['loan'] },
  accounts: { phone: '+917000000105', name: 'Pooja Shinde (test)', roles: ['accounts'] },
  store: { phone: '+917000000106', name: 'Ganesh More (test)', roles: ['store'] },
  procurement: { phone: '+917000000107', name: 'Amit Pawar (test)', roles: ['procurement'] },
  service: { phone: '+917000000108', name: 'Sachin Gaikwad (test)', roles: ['service'] },
  dispatch: { phone: '+917000000109', name: 'Kiran Salunkhe (test)', roles: ['dispatch'] },
  hr: { phone: '+917000000110', name: 'Asha Kale (test)', roles: ['hr'] },
} as const;
export type StaffKey = keyof typeof STAFF;

/** Web password for the standing team (staff sign in on the web with their phone's email). */
export const TEAM_PASSWORD = 'Acceptance@2026';
export const staffEmail = (key: StaffKey) => `${key}.acceptance@oneohm.local`;

export const CREWS = {
  main: {
    name: 'Acceptance Solar Crew (test)',
    phone: '+917000000200',
    lead: { phone: '+917000000201', name: 'Mahesh Kamble (test)' },
    member: { phone: '+917000000202', name: 'Suresh Kamble (test)' },
  },
  other: {
    name: 'Other Installers (test)',
    phone: '+917000000210',
    lead: { phone: '+917000000211', name: 'Dinesh Mane (test)' },
    member: { phone: '+917000000212', name: 'Ravi Mane (test)' },
  },
} as const;
export type CrewKey = keyof typeof CREWS;

export const RESELLERS = {
  first: { phone: '+917000000301', name: 'Sai Solar Promoters (test)' },
  second: { phone: '+917000000302', name: 'Krishna Energy Partners (test)' },
} as const;

interface Role {
  id: string;
  key: string;
}
interface Person {
  id: string;
  fullName: string;
  phone: string | null;
}
interface Contractor {
  id: string;
  name: string;
}

export async function roleIds(admin: Session, keys: readonly string[]): Promise<string[]> {
  const roles = await admin.get<Role[]>('/roles');
  return keys.map((key) => {
    const role = roles.find((candidate) => candidate.key === key);
    if (!role) throw new Error(`Role ${key} is not seeded.`);
    return role.id;
  });
}

export async function personByPhone(admin: Session, phone: string): Promise<Person | undefined> {
  const people = await admin.get<Person[]>('/people');
  return people.find((person) => person.phone === phone);
}

/** Finds the person by phone or adds them with these roles. */
export async function ensurePerson(
  admin: Session,
  input: { phone: string; name: string; roles: readonly string[]; email?: string },
): Promise<Person> {
  const existing = await personByPhone(admin, input.phone);
  if (existing) return existing;
  const created = await admin.post<Person>('/people', {
    fullName: input.name,
    phone: input.phone,
    email: input.email ?? null,
    roleIds: await roleIds(admin, input.roles),
  });
  // Web sign-in is by password, which a person sets themselves with a text code.
  if (input.email) await setWebPassword(input.phone, TEAM_PASSWORD);
  return created;
}

const CREW_PAN = { main: 'AAAPK1234C', other: 'AAAPM5678D' } as const;

async function ensureCrew(admin: Session, key: CrewKey): Promise<void> {
  const crew = CREWS[key];
  const lead = await ensurePerson(admin, { ...crew.lead, roles: ['ic_partner'] });
  const member = await ensurePerson(admin, { ...crew.member, roles: ['ic_partner'] });
  const contractors = await admin.get<Contractor[]>('/contractors');
  const existing = contractors.find((contractor) => contractor.name === crew.name);
  // Without a PAN, TDS is held at 20%; the test crews have one so their 1% still applies.
  if (existing) {
    await admin.patch(`/contractors/${existing.id}`, { pan: CREW_PAN[key] });
    return;
  }
  const contractor = await admin.post<Contractor>('/contractors', {
    name: crew.name,
    kind: 'company',
    phone: crew.phone,
    skills: ['ic_partner'],
    pan: CREW_PAN[key],
    tdsBp: 100,
    retentionBp: 500,
    retentionDays: 90,
    paymentTermsDays: 15,
    bankAccountName: crew.name,
    bankAccountNumber: key === 'main' ? '000111222333' : '000444555666',
    bankAccountNumberConfirm: key === 'main' ? '000111222333' : '000444555666',
    bankIfsc: 'HDFC0000001',
  });
  await admin.put(`/contractors/${contractor.id}/members`, {
    members: [
      { userId: lead.id, lead: true },
      { userId: member.id, lead: false },
    ],
  });
  await admin.post(`/contractors/${contractor.id}/rates`, {
    basis: 'per_kwp',
    label: 'Installation per kWp (test)',
    amountPaise: 300_000,
  });
}

/** Everything the scenarios assume exists. Safe to run again. */
export async function ensureTeam(admin: Session): Promise<void> {
  for (const [key, person] of Object.entries(STAFF)) {
    await ensurePerson(admin, { ...person, email: staffEmail(key as StaffKey) });
  }
  await ensureCrew(admin, 'main');
  await ensureCrew(admin, 'other');
  for (const reseller of Object.values(RESELLERS)) {
    await ensurePerson(admin, { ...reseller, roles: ['reseller'] });
  }
}

export async function contractorByName(admin: Session, name: string): Promise<Contractor> {
  const contractors = await admin.get<Contractor[]>('/contractors');
  const found = contractors.find((contractor) => contractor.name === name);
  if (!found) throw new Error(`Contractor ${name} is missing; the global setup makes it.`);
  return found;
}

export async function staffId(admin: Session, key: StaffKey): Promise<string> {
  const person = await personByPhone(admin, STAFF[key].phone);
  if (!person) throw new Error(`${STAFF[key].name} is missing; the global setup makes them.`);
  return person.id;
}
