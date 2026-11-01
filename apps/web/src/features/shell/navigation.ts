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
} from 'lucide-react';

export interface NavItem {
  /** Message key under `nav.items` and the route segment. */
  readonly key: string;
  readonly href: string;
  readonly icon: LucideIcon;
  /** Screens not built yet stay in the list (the product's shape) but do not link anywhere. */
  readonly built: boolean;
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
      { key: 'today', href: '/today', icon: Sun, built: false },
      { key: 'commandCenter', href: '/command-center', icon: CircleGauge, built: true },
    ],
  },
  {
    key: 'sales',
    items: [
      { key: 'leads', href: '/leads', icon: Target, built: false },
      { key: 'quotations', href: '/quotations', icon: FileText, built: false },
      { key: 'customers', href: '/customers', icon: Users, built: false },
    ],
  },
  {
    key: 'delivery',
    items: [
      { key: 'projects', href: '/projects', icon: SolarPanel, built: false },
      { key: 'discom', href: '/discom', icon: UtilityPole, built: false },
      { key: 'contractors', href: '/contractors', icon: HardHat, built: false },
    ],
  },
  {
    key: 'business',
    items: [
      { key: 'finance', href: '/finance', icon: IndianRupee, built: false },
      { key: 'inventory', href: '/inventory', icon: Boxes, built: false },
      { key: 'team', href: '/team', icon: UsersRound, built: false },
      { key: 'reports', href: '/reports', icon: ChartColumn, built: false },
    ],
  },
  {
    key: null,
    items: [{ key: 'settings', href: '/settings', icon: Settings2, built: false }],
  },
];
