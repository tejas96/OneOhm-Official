# Visit booking — one clean, predictable procedure (design, 2026-11-06)

## Today (problems)

- Two booking paths. The onboarding "Book a visit" only writes a follow-up note: no visit, no
  slot held, so two leads can take the same morning. The staff "Ask the customer to pick" path
  makes a real `proposed` visit that holds the slot.
- Only "morning" / "afternoon", one visit per person per half-day.
- A visit needs a converted customer; a WhatsApp lead has no visit box before conversion.
- Customer picks wait for a staff "Confirm"; the customer is told "we'll confirm by 6:30 pm".
- The day-pick alert goes to whoever answers the chat, not to the person who will visit.
- No list or calendar of visits anywhere; leave is checked only when days are offered.
- Lead stage: stays "New" after the estimate; nothing happens to the stage when a visit is missed.

## The procedure (one engine for every visit the customer picks)

1. **Offer.** The customer gets a picker (WhatsApp form; chat list as fallback) showing only
   **free date + time** slots for the person who will visit.
2. **Hold and book in one step.** On submit the slot is re-checked under a lock and booked
   **confirmed at once** (no staff confirm). If it was taken a second earlier, the form shows
   "That time was just taken" and the next free times — the customer never gets a broken booking.
3. **Tell.** Customer: "Booked ✅ Sat 14 Nov, 10:00–11:30 · Rohit (+91…) will call before coming"
   with [Change time] [Cancel]. Visitor + lead owner: alert and the visit on their Today / field app.
4. **Remind.** Customer: the day before (with [Confirm] [Change time]) and 2 h before. Visitor:
   the morning list. No answer by the visit morning → alert the visitor to call.
5. **Visit.** The visitor checks in (field app), does the survey, marks done.
6. **After.** Done → next action "Send quotation" today. Not done by the slot end + 2 h → missed:
   customer gets "Sorry we missed you — pick a new time" (picker), the lead goes back a stage.

Staff can book, move, reassign or cancel any visit from the lead page or the new Visits page; the
customer is told each time, in their language.

## Slots

- Settings → Visits: working days (Mon–Sat), hours (default 9:30–18:30), lunch (13:00–14:00),
  **visit length incl. travel (default 90 min)**, earliest booking (default: next working day,
  or today if ≥ 3 h away), how far ahead (default 14 days), company holidays.
- Default slots: 10:00, 11:30, 14:00, 15:30, 17:00 (each 90 min). One visit per person per slot.
- Stored as `start_at` + `end_at` on the visit (morning/afternoon rows keep working: they map to
  10:00 / 14:00).
- Busy = an open visit overlapping the time, approved or pending leave, or a company holiday.

## Settings — one source for every value

**Settings → Working time & holidays** (company-wide business calendar; replaces three
unlinked copies of 9:30–18:30 in chat rules, attendance and call promises): working days,
opening and closing time, lunch, holidays. Visits, chat promises ("we'll call by …"),
reminders, attendance and SLA working minutes all read it. The Workforce tab links here
instead of editing its own copy.

**Settings → Visits & bookings** (`visits`): visit length incl. travel, slot start times, visits
per person per slot, customer notice hours, staff may book today, days ahead, days shown,
book customer picks at once, reminder times (day before, hours before), "not confirmed" alert
time, missed after (minutes past the end), who does lead surveys.

**No contradictions:** one validator (used by the API on save and by the page live) checks
both sections against each other — every slot inside working hours and outside lunch, slots
sorted and not overlapping, at least one slot and one working day, reminder times inside working
hours, days shown ≤ days ahead, notice < days ahead. Saving one section re-checks the other.
A change that leaves booked visits outside working time saves, but lists those visits to move.
The page shows a live preview of a working day and what customers can book.

## Who visits (assignment)

- Lead survey: the **lead owner**. If the owner is on leave or full, the picker offers the free
  times of the other people who do surveys in that city (skill `surveys.perform` + service area);
  the booking goes to the first free one, owner preferred. The lead owner is always told.
- Project task: the task's assignee (unchanged). Service: the ticket's assignee (unchanged).
- DISCOM visits (inspection, net meter): no picker — the DISCOM sets the day (unchanged).
- Reassign = change the lead owner / task assignee / ticket assignee, or "Change person" on the
  visit. The visit follows, the new person's time is checked; a clash alerts the manager.
- The WhatsApp chat of a lead is answered by the lead owner (one person, no split like Priya/Tanvi).

## WhatsApp picker

- **Form (Flow) with a data endpoint**: screen 1 = DatePicker (min/max date, unavailable dates);
  on date change the endpoint returns that day's free times; screen 2 = times as buttons + note;
  submit books it. Needs: an RSA key pair uploaded to Meta, `POST /v1/flows/visit` on the API
  (decrypt → answer → encrypt, < 3 s), Meta health check.
- **Fallback (old phones, form off, closed window)**: chat list of the next free days → list of
  that day's free times (max 10 rows each) → booked.
- Outside the 24 h window: an approved template with a form button ("Pick a time").

## Lead stage — automatic, predictable

| Event | Stage | Next action set to |
|---|---|---|
| Lead created (form, chat, staff, website, referral) | New | Today: "Call — new lead" |
| Instant estimate sent, or customer taps Call me / Not now | Contacted | Their choice (call day / later date) |
| Staff call / chat reply / visit logged | Contacted | What staff enter |
| Visit booked (customer or staff) | Survey booked | Visit day + time: "Site visit" |
| Visit moved | Survey booked | New day + time |
| Visit cancelled | Back to the stage before | Today: "Visit cancelled — call" |
| Visit missed | Back to Contacted | Today: "Visit missed — rebook" |
| Visit done | Survey booked (stays) | Today: "Send quotation" |
| Quote sent | Quoted | +2 days: "Follow up quote" |
| Quote accepted | Won | Today: "Start project" |
| Marked lost (staff, with reason) | Lost | Revisit day if given |

- Auto moves only go **forward** (except cancel/missed, which go back one step) and never touch
  Won/Lost. A manual stage change always wins and is logged; the next automatic event continues
  from there.
- Every move writes one history line ("Moved to Survey booked — visit booked by the customer").

## Edge cases covered

Same slot picked twice at once (lock + re-check) · slot taken between offer and submit · customer
books a second visit (moves the open one instead) · change time / cancel from WhatsApp · past
times today · Sundays and holidays · visitor on leave after booking (alert + reassign suggestion)
· lead owner changed (visit follows) · lead lost (visit cancelled, customer told) · lead converted
(visit carries over) · window closed (template) · old phone (chat fallback) · form token reused or
old · DISCOM visits unchanged · no free slot in 14 days (alert the team, offer "talk to a person").

## Staff screens

- **Visits page** (new, menu): day / week list grouped by person, filters (person, kind, status,
  city), each row: time, customer, place, kind, status; actions Move, Change person, Cancel, Done.
- **Today page / field app**: "My visits" with time, address, map, call button.
- **Lead page**: visit box works before conversion; shows time, visitor, customer confirmed.

## Build phases

1. Slots by time + Settings, one engine (lead visits without a customer), instant booking,
   chat-list picker, alerts to visitor + lead owner, stage rules, Visits page, Today list. (~2 days)
2. WhatsApp form with DatePicker and the data endpoint, template with a form button. (~1.5 days)
3. Surveyor pool (owner busy → other surveyors in the city). (~0.5 day)
