import type { Capability } from '@oneohm/domain';
import {
  Boxes,
  ChartColumn,
  CircleGauge,
  FileText,
  HardHat,
  IndianRupee,
  type LucideIcon,
  Settings2,
  SolarPanel,
  Sun,
  Target,
  Users,
  UsersRound,
  UtilityPole,
  Wrench,
} from 'lucide-react';

export interface NavItem {
  /** Message key under `nav.items` and the route segment. */
  readonly key: string;
  readonly href: string;
  readonly icon: LucideIcon;
  /** Screens not built yet stay in the list (the product's shape) but do not link anywhere. */
  readonly built: boolean;
  /** Shown only to people holding at least one of these. */
  readonly requires?: readonly Capability[];
}

export interface NavGroup {
  /** Message key under `nav.groups`; `null` for the ungrouped top entries. */
  readonly key: string | null;
  readonly items: readonly NavItem[];
}

/** One list for the whole web app, in the order an EPC business works. */
export const NAVIGATION: readonly NavGroup[] = [
  {
    key: null,
    items: [
      { key: 'today', href: '/today', icon: Sun, built: true },
      {
        key: 'commandCenter',
        href: '/command-center',
        icon: CircleGauge,
        built: true,
        requires: ['dashboard.view_business'],
      },
    ],
  },
  {
    key: 'sales',
    items: [
      {
        key: 'leads',
        href: '/leads',
        icon: Target,
        built: true,
        requires: ['leads.view_all', 'leads.view_own', 'leads.manage'],
      },
      {
        key: 'quotations',
        href: '/quotations',
        icon: FileText,
        built: true,
        requires: ['quotations.view', 'quotations.create'],
      },
      {
        key: 'customers',
        href: '/customers',
        icon: Users,
        built: true,
        requires: ['customers.view'],
      },
    ],
  },
  {
    key: 'delivery',
    items: [
      {
        key: 'projects',
        href: '/projects',
        icon: SolarPanel,
        built: true,
        requires: ['projects.view_all'],
      },
      {
        key: 'discom',
        href: '/discom',
        icon: UtilityPole,
        built: false,
        requires: ['discom.manage', 'settings.manage'],
      },
      {
        key: 'contractors',
        href: '/contractors',
        icon: HardHat,
        built: false,
        requires: ['contractors.manage'],
      },
      {
        key: 'service',
        href: '/service',
        icon: Wrench,
        built: true,
        requires: ['service.manage', 'customers.view'],
      },
    ],
  },
  {
    key: 'business',
    items: [
      {
        key: 'finance',
        href: '/finance',
        icon: IndianRupee,
        built: false,
        requires: ['finance.view'],
      },
      {
        key: 'inventory',
        href: '/inventory',
        icon: Boxes,
        built: true,
        requires: ['inventory.view'],
      },
      {
        key: 'team',
        href: '/team',
        icon: UsersRound,
        built: true,
        requires: ['people.view', 'people.manage'],
      },
      {
        key: 'reports',
        href: '/reports',
        icon: ChartColumn,
        built: true,
        requires: ['reports.generate', 'dashboard.view_business'],
      },
    ],
  },
  {
    key: null,
    items: [
      {
        key: 'settings',
        href: '/settings',
        icon: Settings2,
        built: true,
        requires: ['settings.manage', 'roles.manage'],
      },
    ],
  },
];
