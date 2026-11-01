/** Search in the field app (PRD 10: universal search). */
export const SEARCH = {
  open: 'Search',
  overline: 'FIND',
  title: 'Search',
  label: 'Search projects, customers, leads and tasks',
  placeholder: 'Name, phone, project code or task',
  hint: 'Type two letters or more. You find only what your role can open.',
  loading: 'Searching',
  emptyTitle: (query: string) => `Nothing matches “${query}”`,
  emptyBody: 'Try part of a name, a phone number or a project code like OH-2026-002.',
  groups: {
    projects: 'Projects',
    customers: 'Customers',
    leads: 'Leads',
    tasks: 'Tasks',
  },
  projectStatus: {
    active: 'Active',
    operational: 'Operational',
    completed: 'Completed',
    cancelled: 'Cancelled',
  } as Readonly<Record<string, string>>,
  call: (name: string) => `Call ${name}`,
  callButton: 'Call',
  noPhone: 'No phone number on record.',
  yourTasks: 'Your open tasks here',
  noTasks: 'You have no open tasks on this project.',
} as const;
