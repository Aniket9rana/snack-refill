# Refill: office snack desk

Automates the Oslo + Bengaluru snack refill process: one named person responsible at a time, automatic hand-over, budget in each office's currency, claims sent to HR immediately, one monthly report.

- **Design doc:** [docs/DESIGN.md](docs/DESIGN.md)
- **Core logic:** [src/domain/](src/domain) (framework-free TypeScript; simulated chat + HR in `fakes.ts`)
- **Tests:** `npm test` (domain rules in `src/domain/*.test.ts`, six weeks of simulated office in `src/sim`)
- **Live simulation UI:** `npm run dev` → http://localhost:3000. Play/pause a simulated clock, report a box empty, answer as a volunteer, trigger an HR outage, run a "5 people tap at once" race.

Stack: Next.js 16, Tailwind 4, motion, Peel UI components (reused from the ebook-store project).
