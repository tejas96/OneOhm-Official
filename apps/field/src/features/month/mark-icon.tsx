import { Ban, CircleHelp, Clock, LogOut } from 'lucide-react-native';
import type { MarkKey } from './day-status';

/**
 * The glyph for a day mark: a clock (late), a door (closed by us), a question (doubtful), a
 * crossed circle (day off not paid).
 */
export function MarkIcon({ mark, size, color }: { mark: MarkKey; size: number; color: string }) {
  const Icon = { late: Clock, autoClosed: LogOut, doubtful: CircleHelp, offUnpaid: Ban }[mark];
  return <Icon size={size} color={color} strokeWidth={2.4} />;
}
