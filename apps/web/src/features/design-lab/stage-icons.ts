import {
  ClipboardCheck,
  Gauge,
  Landmark,
  type LucideIcon,
  Package,
  Ruler,
  Wrench,
  Zap,
} from 'lucide-react';
import type { EpcStage } from '../command-center/preview-data';

/** One icon per EPC stage, shared by every lab variant. */
export const STAGE_ICONS: Readonly<Record<EpcStage, LucideIcon>> = {
  survey: ClipboardCheck,
  design: Ruler,
  material: Package,
  installation: Wrench,
  commissioning: Zap,
  netMetering: Gauge,
  subsidy: Landmark,
};
