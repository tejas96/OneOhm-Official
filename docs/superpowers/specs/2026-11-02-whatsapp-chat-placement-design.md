# WhatsApp chats: where they live and who answers — design

Date: 2026-11-02 · Status: approved by the owner in chat

## Why

WhatsApp chat now covers sales, projects and after-sales, but the staff inbox sits under
**Service → WhatsApp**. Sales people read "Service" as complaints and never look there;
project managers work from Projects; the same chat also shows read-only on the customer
page, so people read in one place and answer in another. The product's own rules (PRD
§9: role-specific interfaces, contextual cards, progressive disclosure, no clutter,
minimum manual effort) say work should come to the person and live with the record.

## The rule

Chats come to **the person** (Today) and live with **the record** (customer, lead).
They never live on a department page. Each screen shows only what its role needs.

## Goals

- Everyone who answers chats finds them where they already start the day.
- Anyone looking at a customer or lead can read and answer the chat there.
- No customer message waits unseen: an owner, a fallback, and a clear late signal.
- Customers always reach a person who knows them, in their language, without repeating.

## Non-goals

- A separate "Chats" item in the main menu.
- A full chat on the project page (one chat is one phone number, not one project).
- Changing the field app's chat flow (it already follows this rule).
- Group chats, media galleries, or chat search.

## Anti-goals (a failure even if it works)

- The same chat answerable in two different-looking places.
- A new screen that people must remember to check.
- Customers getting a cold "Sorry, I did not get that" after replying to our own update.

## Where chats live

| Place | What it shows | Who |
|---|---|---|
| Web **Today → Chats** tab | Beside "My work · Approvals", with a count of chats waiting for this person. The existing two-pane inbox (list + conversation + reply). | Anyone with chats |
| ↳ desk filters | Adds "Not assigned" and "Late" to All · Mine · Needs a reply. | `service.manage` or `customers.manage` |
| **Customer page** → Conversations | The full chat with the same reply box (inside 24 h a reply, after it the follow-up template). | Anyone who can see the customer |
| **Lead page** | The same chat and reply box, found by the lead's phone. | Sales |
| **Project page** | A small card: "Customer chat · Needs a reply · Open chat" → the customer page chat. Hidden when nothing waits. | Project managers |
| **Command centre** | One number: customers waiting over 2 hours. Links to Today → Chats (Late). | Owner |
| **Service page** | Requests and Message log only. Old `/service?tab=whatsapp&chat=` links redirect to Today → Chats. | Service desk |
| **Field app** | Unchanged (Today card, chat screen, Me → WhatsApp chats). | Field staff |

## Who answers a chat (the owner)

1. The manager of the customer's newest project.
2. Else the owner of the newest lead for this customer or number.
3. A stranger (no customer, no lead) goes to **sales** (`leads.manage`) as a new enquiry,
   with "Make lead" one tap away. (Today it goes to the service team.)
4. An owner who is inactive or on leave today is covered by their leave backup, else the
   desk (`service.manage`).

## Edge cases to fix

1. **Reply to our own update.** Free text that is not a menu word, sent within 24 hours
   after a business message we sent, goes to the chat's owner with a warm note to the
   customer ("Thanks, Asha will reply here"), not "Sorry, I did not get that".
2. **Family members.** A number saved as a customer's family member opens that
   customer's chat (same customer, same owner), not a stranger chat.
3. **Lead becomes a project.** When a project gets a manager, the customer's chat moves
   to that manager unless a person answered in the last 24 hours.
4. **Owner away or gone.** Alerts and reminders go to the backup or the desk (rule 4).
5. **Night messages.** Outside working hours, a chat with a person gets one calm
   auto-reply per night: "We reply 9:30 am to 6:30 pm. Your message is with Asha." In the
   customer's language. A business setting, on by default.
6. **Pass to…** A button in the chat hands it to another staff member, who is alerted.

## Builder's calls (not decided by the owner)

- Exact wording of tabs, cards and the night reply (plain, short, three languages for
  customer-facing words).
- "Late" means a person owes a reply for over 2 hours of working time (same clock as the
  reminders).
- The command-centre count reuses the reminder rule, not a new one.
- Old links redirect rather than break.
