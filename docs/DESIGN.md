# Snack refill: design (Oslo + Bengaluru)

## What "automate" means here
Not "build an app people must open". The failure today is *diffusion of responsibility*, so the system's one job is to make **exactly one named person responsible at any moment**, give them a deadline, and move on automatically when they miss it. Everything else (budget, claims, reports) hangs off that. People interact only through the chat tool they already use; HR is called by the system, not by volunteers.

## From "empty" to "reimbursed"
```
report ─► OFFERED ─accept─► COMMITTED ─receipt─► PURCHASED ─HR has it─► CLAIMED ─► REIMBURSED
            │ decline / 2 h no answer     │ 24 h missed        (HR down: retried)   └► CLAIM_REJECTED
            ▼                             ▼
      next person …  after 3 asks ─► ESCALATED (everyone eligible, first tap wins)
      no budget left ─► BUDGET_HOLD ─(new month)─► offering resumes
```
1. Anyone taps "box is empty" (optionally what ran out). If the office already has an open refill, the report just joins it.
2. The picker chooses **one** person and DMs them: 2 h to answer, spend cap shown.
3. Accept reserves the cap from the office budget and starts a 24 h clock (reminder at 12 h). Miss it and the refill passes to someone else; the reservation is released.
4. The buyer uploads the receipt and amount. The claim goes to HR **immediately** (amount, currency, description, receipt, employee id, idempotency key = refill id). If HR is down the receipt is stored and the claim is retried every tick.
5. The system polls HR; on approval the buyer is told what lands in their payroll currency. A claim pending > 7 days nudges the lead; a rejection voids the spend and alerts the lead.

## Parts and the data each keeps
| Part | Keeps |
|---|---|
| **Refill service** (state machine) | refills: state, `version`, who was asked / declined, deadlines, receipt, claim id, audit history |
| **Picker** (pure function) | nothing; derives rank from refills + presence + policy |
| **Budget ledger** | one entry per refill (reserved → spent / released / voided), per office, per month, **in the office's own currency, integer minor units** |
| **Presence** | per volunteer: home office, office weekdays, holidays, visits |
| **Chat adapter / HR adapter** | nothing. Narrow interfaces; the HR adapter is idempotent by key |
| **Report** | computed on demand from the above; stores the FX rate snapshot used |

## How each problem is prevented
- **Box empty for days:** one owner at a time + automatic hand-over (2 h offer, 24 h delivery) + escalation to everyone and the lead after 3 asks or when nobody is available.
- **Two people buy on the same day:** (a) at most one open refill per office (unique constraint, so two simultaneous reports merge); (b) taking a refill is a compare-and-set on `version`: concurrent takers get exactly one winner, the rest are told politely. Tested with simultaneous calls.
- **A few people do everything / wait weeks:** picker order = in the office today → fewest refills in 60 days → longest since last. Anyone with ≥2 unpaid claims or > 2 500 NOK owed is skipped. The claim is sent the moment the receipt lands, so the only wait left is HR's own 1-10 days.
- **No spend visibility:** a ledger per office/month, a monthly report with spend, utilisation, time-to-refill, time-to-reimburse, items bought vs ran out, and each volunteer's share.
- **Hybrid / holidays / visitors:** availability is computed per day. In office (including a visitor) beats working remotely beats unavailable. A visitor from Oslo in Bengaluru counts for Bengaluru: they buy in INR, against Bengaluru's budget, and HR pays them in NOK.
- **Budget:** reserve a cap on commit (min(1 200 NOK / 3 000 INR, what is left)), swap for the real amount on receipt. Below the typical minimum left → BUDGET_HOLD and the lead is told. A receipt that would exceed the budget is refused unless a lead approves. Warns at 80%.
- **Two currencies:** every sum stays in its own currency. Only the management line converts (to NOK), once, with the month's stored rate, so closed months never move.

## Trade-offs, and what I deliberately did not build
- **Push, not rota or broadcast.** A rota breaks on hybrid work and holidays; a broadcast is today's problem with a button. Cost: a chat message to one person per refill; the picker must be explainable (the UI shows why someone is next).
- **A cap, not exact pre-approval.** Volunteers spend their own money, so the cap is communicated up front; actual receipts decide the books. Over-cap is a lead decision, not silently allowed.
- **Presence from a schedule + holidays + visits** (HR or calendar feed in reality), not live chat presence. Simpler and testable; stale schedules are the risk.
- **Spend is counted by receipt date, not claim approval date**, so management sees spend when it happens, not 10 days later.
- **Not built:** inventory sensors/weights, receipt OCR (HR checks receipts), a standalone web app for volunteers (the chat bot is the UI; the web demo here is only for exploring the logic), live FX rates, time-zone-aware quiet hours for nudges, per-snack stock tracking, a company-card or supplier-subscription alternative (probably the best *business* answer, but it removes the process rather than automating it), retrying a hand-over when a late buyer shows up after being replaced (a lead resolves it).

## Assumptions
HR approval = payout; HR accepts a client-supplied idempotency key (otherwise the adapter must look the claim up before retrying); the chat tool supports DMs, channels and buttons; "leads" are a known group per office.
