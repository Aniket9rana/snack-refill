# Refill (office snack desk)

Take-home: automate the Oslo + Bengaluru snack refill process. Design in `docs/DESIGN.md`; readme in `README.md`.

## Commands
`npm run dev` · `npm test` (vitest) · `npm run typecheck` · `npm run lint` · `npm run build`

## Architecture
- `src/domain/` pure TS, no React/Next: `service.ts` (lifecycle: reportEmpty/accept/decline/openToEveryone/completePurchase/tick), `picker.ts` (ranking, pure), `ledger.ts` (budget per office/month/currency), `presence.ts`, `report.ts`, `ports.ts` (Chat/HR/Clock/Repo interfaces), `fakes.ts` (simulated chat + HR + clock), `repo.ts` (in-memory with compare-and-set), `testing.ts` (test fixtures). `index.ts` exports everything + `createWorld()`.
- `src/sim/` drives the real service with a simulated office (`simulation.ts`: bots, box drain, warm-up of 6 weeks, manual actions), `roster.ts` = 15 Oslo + 20 Bengaluru volunteers. No domain logic here.
- `src/components/app/` UI (Peel "carbon" language copied from ebook-store: tokens in `app/globals.css`, springs in `lib/motion.ts`); `components/ui/` vendored Peel parts (`magnetic-split-button` got an `icon` prop).

## Rules / invariants
- Money = integer minor units + currency. Sums stay in one currency; only `monthlyReport` converts (to NOK, rate snapshot stored on the report).
- At most ONE open refill per office (repo emulates a partial unique index). Every state change is compare-and-set on `version`; chat messages are sent only after the write succeeded.
- `tick()` must stay idempotent. Claim idempotency key = `snack-refill:<refillId>`.
- Changing a rule in `service.ts`/`picker.ts` means updating the tests and `docs/DESIGN.md`.
- UI: use tokens (`bg-surface`, `text-ink`…), springs from `lib/motion.ts`, animate transform/opacity; no hard-coded colours.

- Layout: the page root must be `w-full` (it is a flex child of the body column, otherwise it shrinks to its content and leaves gaps at the sides); content max width is 2200px with `xl:px-12`. A 3D tilt/parallax depth pass was tried and reverted at the user's request: do not re-add unasked.

## Deploy
No Vercel login on this machine: `npx vercel@latest deploy --temporary --yes` makes a 60-minute anonymous deployment (claim link in the output keeps it).

## Not built
Real chat/HR adapters, persistence, auth, quiet hours/time zones for nudges, lead UI for raising budgets (the receipt sheet has a "lead approved" checkbox instead).
