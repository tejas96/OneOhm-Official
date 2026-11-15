# Leave cover: the backup says yes or no

Date: 2026-11-15. Branch: `feat/leave-cover-consent`.

## Problem

- The person named to cover a leave is never asked. The work moves to them by force on approval.
- They hear only once, after the approval: "You are covering for X".
- Tasks already late at hand-over cost the backup their on-time points and streak.

## Rule

A named backup must accept before the leave can be approved with them. Every answer carries a note,
and every side hears about every change.

## Data

`leave_requests` gets three columns (migration `0098_leave_cover_answer`):

| Column | Meaning |
| --- | --- |
| `cover_answer` | `asked`, `accepted`, `declined`; null when nobody is named |
| `cover_note` | The backup's note. Needed to decline, optional to accept |
| `cover_answered_at` | When they answered |

Backfill: pending leave with a backup → `asked`. Decided leave with a backup → `accepted` (history).

`task_handover` activities get `data: { leaveId, toUserId, lateDays }`.

## Flow

1. **Apply** with a backup → `asked`. The backup gets a notice with the dates and the hand-over note.
   Approvers get the usual notice.
2. **Backup answers** (`POST /leave/:id/cover { accept, note }`).
   - Only the named backup. Only while the leave is pending and the answer is `asked`.
   - Decline needs a note. Accept is refused when the backup has their own leave in that window.
   - The applicant and the approvers get the answer and the note.
3. **Change backup** (`POST /leave/:id/backup { backupUserId | null }`), by the applicant or an approver, while pending.
   - The old backup is told they are no longer needed. The new one is asked.
4. **Approve**
   - A named backup must have `accepted`. "Not answered yet" or "declined, ask someone else" otherwise.
   - The approver cannot swap in a person who was not asked. They ask them first (step 3).
   - The approver may clear the backup. The old rules then apply: no work → fine; emergency → may skip hand-over.
   - The backup is checked again: still active, not on leave in the window.
5. **Reject** needs a note. The applicant gets it. An asked or accepted backup is told the cover is not needed.
6. **Cancel**
   - Pending: an asked or accepted backup is told the cover is not needed.
   - Approved: the backup and the approver are told. The handed work stays with the backup; the manager moves it back if needed.

## Points

- A task handed over already late: the days it was late before the hand-over do not count against the backup.
  The reason says so: "On time (after 3 days late before hand-over)".
- The on-time streak treats such a task as late on others, so the streak does not break.

## Edge cases covered

- Backup = applicant: refused (apply, change, approve).
- Backup answers twice, or after the leave is decided or cancelled: refused.
- Someone who is not the backup answers: refused.
- Backup goes inactive or takes leave after accepting: approve refused with a clear reason.
- Backup declines: the applicant and approvers see the note and can ask someone else.
- Approver picks someone new at approval: refused, ask them first.
- Leave with no affected work and no backup: approve as before.
- Emergency leave: may clear the backup and skip hand-over, as before.
- Old pending requests (before this change): backfilled to `asked`; the backup sees them in their cover list.

## Screens

- Web, Team → Leave: "Asked to cover" list with Accept / Decline (note). My leave shows the answer and "Ask someone else".
  The approve dialog shows the answer, offers "Ask someone else", and needs a note to decline.
- Field app, Leave: the same "Asked to cover" list with Accept / Decline, and the answer on my leave.
