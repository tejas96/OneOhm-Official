import { useState } from 'react';
import type { LeaveWindow } from './use-send-leave';

export type LeaveKind = 'planned' | 'emergency';
export type LeaveLength = 'full' | 'half';

/** The days part of a leave request, and the window it makes once the days are picked. */
export function useLeaveForm(defaultType: string | null) {
  const [leaveType, setLeaveType] = useState<string | null>(null);
  const [kind, setKindState] = useState<LeaveKind>('planned');
  const [from, setFromState] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [length, setLength] = useState<LeaveLength>('full');
  const type = leaveType ?? defaultType;
  const last = to && from && to >= from ? to : from;
  const oneDay = from !== null && from === last;
  const window: LeaveWindow | null =
    type && from && last
      ? { leaveType: type, fromDate: from, toDate: last, halfDay: oneDay && length === 'half' }
      : null;
  return {
    type,
    kind,
    from,
    last,
    length,
    oneDay,
    window,
    setLeaveType,
    setLength,
    setTo,
    setKind: (next: LeaveKind) => {
      setKindState(next);
      setFromState(null);
      setTo(null);
    },
    setFrom: (date: string) => {
      setFromState(date);
      if (to && to < date) setTo(null);
    },
  };
}

export type LeaveForm = ReturnType<typeof useLeaveForm>;
