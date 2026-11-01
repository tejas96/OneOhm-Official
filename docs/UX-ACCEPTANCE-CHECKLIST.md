# UX acceptance checklist (PRD section 13, "UX")

The requirement: new users complete common workflows without training, tested with real
OneOhm staff. A machine cannot judge this, so the owner runs it before each release. The
automated suite (`pnpm test:acceptance`) shows this row as **MANUAL**.

## How to run it

- **Who:** at least one person per role who has **not** used OneOhm before: sales,
  execution or site engineer, liaisoning, accounts, a crew member, and one real customer
  or a family member acting as one.
- **Where:** the staging site, or the dev machine with the acceptance data. Use "(test)"
  customers, never real customer records.
- **How:**
  - Give each person the task in one sentence, on their own phone or laptop, and then
    stay quiet. No demo first, no hints.
  - Note the time taken, where they hesitated, and any time they asked for help.
- **Pass mark for a task:** finished correctly, without help, within the time shown.
- **Pass mark for the release:** every task passes. A task that fails gets a fix and is
  run again with a different new person.

## Tasks

| # | Who | Task, as said to the person | Time | Done right when |
|---|-----|-----------------------------|------|-----------------|
| 1 | Sales (web or field app) | "A caller wants 3 kW on his house. Send him a price on WhatsApp." | 5 min | A sent quotation shows price, subsidy and effective cost |
| 2 | Sales | "He asked for non-DCR panels. Show him the difference." | 3 min | They find the DCR / non-DCR comparison and explain the ₹0 subsidy |
| 3 | Execution (field app) | "Do today's site survey for this project." | 10 min | Survey complete with photos, measurements and checklist |
| 4 | Execution (web) | "The customer accepted. Start the project." | 5 min | Project created; they can say who does the next tasks |
| 5 | Crew member (field app) | "Finish the panel installation task." | 5 min | Task in review with photos and serial numbers |
| 6 | Liaisoning (web) | "MSEDCL has not replied. Mark it and show who is waiting." | 3 min | Task waiting on DISCOM; they find it on the DISCOM desk |
| 7 | Accounts (web) | "The customer paid ₹50,000 by cheque. Record it and give a receipt." | 3 min | Payment recorded; receipt PDF opened |
| 8 | Accounts (web) | "Pay the crew's approved bill." | 3 min | Bill paid (bank transfer or payout) |
| 9 | Any staff (field app) | "Apply for leave next Friday." | 3 min | Request sent with a backup named where the app asks |
| 10 | HR or manager (web) | "Approve the pending leave." | 3 min | Approved after choosing who covers the work |
| 11 | Customer (customer app) | "Check how far your installation has gone." | 2 min | They read the current stage and subsidy status aloud |
| 12 | Customer | "Pay the amount that is due." | 3 min | Payment completes (sandbox) and shows as paid |
| 13 | Customer | "Find your quotation and download it." | 2 min | PDF opened |
| 14 | Customer | "The inverter shows an error. Ask for help." | 3 min | Service request raised and visible on the service desk |
| 15 | Owner (web) | "Which projects are in trouble, and why?" | 2 min | They name the risky projects and the cause from the command centre alone |
| 16 | Any staff | "Find all documents for project OH-…, and print the checklist." | 3 min | Combined PDF or checklist PDF opened |

## Record

Copy this table for each session.

| Date | Person (role) | Task # | Minutes | Help needed? | Passed? | Notes |
|------|---------------|--------|---------|--------------|---------|-------|
|      |               |        |         |              |         |       |

Keep the filled-in sheet with the release notes. Open an issue for every hesitation that
cost more than a minute, even when the task passed.
