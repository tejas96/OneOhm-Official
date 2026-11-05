'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const TEMPLATE_KEYS = {
  tasks: ['settings', 'task-templates'],
  messages: ['settings', 'message-templates'],
  roles: ['roles'],
} as const;

export function useTaskTemplates() {
  return useQuery({
    queryKey: TEMPLATE_KEYS.tasks,
    queryFn: () => expectStatus(api.templates.taskTemplates(), 200),
  });
}

export function useMessageTemplates() {
  return useQuery({
    queryKey: TEMPLATE_KEYS.messages,
    queryFn: () => expectStatus(api.templates.messageTemplates(), 200),
  });
}

export function useRoleOptions() {
  return useQuery({
    queryKey: TEMPLATE_KEYS.roles,
    queryFn: () => expectStatus(api.people.listRoles(), 200),
    select: (roles) =>
      roles.filter((role) => !role.archived).map((role) => ({ value: role.key, label: role.name })),
  });
}

/** Sample details for previews of customer messages. */
export const SAMPLE = {
  customer: 'Ramesh Patil',
  name: 'Asha',
  project: 'OH-2026-014',
  milestone: 'Installation completed',
  capacity: '3.27 kWp',
  number: 'OH-Q-2026-0021',
  total: '₹2,25,396',
  subsidy: '₹78,000',
  effective: '₹1,47,396',
  amount: '₹56,349',
  link: 'https://rzp.io/l/example',
  topic: 'Inverter error',
  date: 'Wed, 4 Nov',
  reason: 'the electricity board (DISCOM)',
  status: 'resolved',
  request: 'Name change',
  friend: 'Suresh Jadhav',
  overdue: '2',
  today: '3',
  followUps: '1',
  visit: 'Half-yearly service',
  document: 'Latest electricity bill',
  home: 'Pune',
  stage: 'installation',
  work: 'the panel installation',
  staff: 'Priya',
  manager: 'Vikram Jadhav',
  message: 'We will reach your site at 11 am tomorrow.',
  subject: 'your solar project (OH-2026-014)',
  phone: '+91 98765 43210',
  when: 'Thu 6 Nov, morning',
  day: 'Thu 6 Nov',
} as const;

/** Samples that differ by message: the invite carries the app link, not a pay link. */
const SAMPLE_BY_KEY: Readonly<Record<string, Partial<Record<keyof typeof SAMPLE, string>>>> = {
  staff_welcome: { link: 'https://app.oneohm.in' },
};

/** The sample details for one message's preview. */
export const sampleFor = (key: string): Readonly<Record<string, string>> => ({
  ...SAMPLE,
  ...SAMPLE_BY_KEY[key],
});
