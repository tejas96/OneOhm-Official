# One site survey — simple build plan (2026-11-13)

Status: plan for owner approval. No code is changed yet.
Owner decisions (2026-11-13): keep it simple; no manager step before the quote; the project
keeps its survey and it can be done again; no time limits, no new settings.

## Today (problems)

- The lead's "Site survey visit" is only a day and a time. It saves nothing and the field worker
  does not see it in the field app. The real survey starts only after the quote is accepted.
- The lead visit always goes to the lead owner. Nobody can change the person.
- The Visits page is read-only.
- The stage "Survey booked" can be set by hand with no visit.

## The flow

**Way 1 — Normal.** Estimate → quotation → accept → project starts → Site survey (as today).

**Way 2 — Visit first.**
1. The customer taps the visit button on WhatsApp, or the salesperson taps **Survey first** on
   the lead.
2. The salesperson picks the field worker and the time on the lead. Nobody picked → the
   salesperson.
3. The field worker does it in the field app: check in, form, photos, done.
4. The quotation is sent with the survey numbers in it, by the field worker (field app) or the
   salesperson (lead).
5. Accept → project starts. Its Site survey job is already filled in and done.
6. **Survey again** on that job (reason required) opens it for a new visit when something
   changed. From there it is the normal project survey.

## What is built

### Part 1 — Assign and truth (small)

1. **Change person** on the visit box (lead, task, service ticket) and on each Visits row.
2. Visits page: Move, Change person, Cancel, Done on each row.
3. The Survey stage is set by the system only (visit booked). By hand it is not offered.
4. A missed visit sends the lead back to the stage it had before.
5. Fix leads that are in the Survey stage with no visit (back to Contacted, one history line).

### Part 2 — Survey first

1. One new table `site_surveys`: lead, site, field worker, status (`booked`, `done`,
   `cancelled`), answers (same keys as the project survey), note. One open survey per lead.
2. The lead's visit box becomes the **Site survey** box: person, time, state, answers, photos.
3. Field app: the survey shows on Today for the field worker. It uses the task screen's own
   form, photos and check-in. "Done" finishes it.
4. Quotation (web and field app): floors, structure, cable lengths and usable area are filled
   from the survey.
5. Project start: the survey's answers and photos are copied to the project's survey task and
   the task is marked done ("Done before the quote by {name} on {date}"). The price check runs.
6. **Survey again** button on the project survey task: reason required, the task opens with the
   old answers filled in, old answers stay in the history.

### Part 3 — Words

One name each: the job is **Site survey**, the appointment is a **visit**. Fix the mixed labels
in web, field and customer copy (en, hi, mr). WhatsApp buttons stay as they are.

## Edge cases

- Survey first needs the site's address. No site on the lead → the "Add the site" step that the
  quotation already needs opens first.
- Field worker on leave or busy at that time → the picker does not offer them.
- Field worker changed after booking → the visit follows; the customer is told the new name.
- Visit missed or cancelled → survey back to "not booked"; the salesperson books again.
- Customer absent at the visit → the field worker marks "Could not do it"; same as missed.
- Quote sent before the survey is done → allowed. At project start the open visit moves to the
  project's survey task.
- Lead lost → survey and visit cancelled, customer told (rule that exists).
- No early survey → project survey as today. Nothing changes.
- Survey again while work has started → allowed; the reason is logged on the project.
- Survey again changes the price → the price check and revision that exist.
- Points: the field worker gets the normal task points once, when the early survey is done.
- Old data: open lead visits become `booked` surveys with the same person and day.

## Not built

Time limit on an early survey · automatic "survey again" checks · "survey first" rules per site
type · self survey before the quote · new WhatsApp buttons · a manager check before the quote.

## Tests

- Unit: stage rules, project start with and without an early survey, Survey again.
- Acceptance `71-site-survey-*`: book, do in the field app, quote filled, accept, project
  survey done; change person; missed; lead lost; survey again. `66-visits-*` and
  `69-self-survey-*` stay green.
