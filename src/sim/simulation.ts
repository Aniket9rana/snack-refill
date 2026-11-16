import {
  DomainError,
  OFFICES,
  SNACK_CATALOG,
  availabilityTier,
  createWorld,
  monthKey,
  monthlyReport,
  presenceOf,
  rankCandidates,
  statsFor,
  DEFAULT_POLICY,
  type BudgetSnapshot,
  type Candidate,
  type ChatMessage,
  type MonthlyReport,
  type OfficeId,
  type Presence,
  type Refill,
  type Volunteer,
  type VolunteerStats,
} from "@/domain";
import { buildRoster } from "./roster";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const STEP = 30 * MIN;
export const START = Date.UTC(2026, 9, 5, 9, 0); // Mon 5 Oct 2026
export const WARM_UP_UNTIL = Date.UTC(2026, 10, 16, 9, 0); // Mon 16 Nov 2026

export type SimMessage = ChatMessage & { at: number; id: number };

export interface VolunteerView {
  volunteer: Volunteer;
  presence: Presence;
  stats: VolunteerStats;
  /** 1-based position in the queue for their office, or null if not eligible right now. */
  rank: number | null;
  /** Why they are out right now (when rank is null). */
  blocker?: string;
}

export interface Snapshot {
  ready: boolean;
  now: number;
  month: string;
  running: boolean;
  speed: number;
  autopilot: boolean;
  hrDown: boolean;
  refills: Refill[];
  budgets: Record<OfficeId, BudgetSnapshot>;
  box: Record<OfficeId, number>;
  volunteers: VolunteerView[];
  candidates: Record<OfficeId, Candidate[]>;
  messages: SimMessage[];
  reports: Record<string, MonthlyReport>;
  conflictsBlocked: number;
  toasts: { id: number; tone: "ok" | "warn" | "info"; text: string }[];
}

type Plan = { at: number; action: "accept" | "decline" | "ignore" | "complete" };

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Drives the real domain service with a simulated office: boxes empty out, volunteers (bots) answer, buy, and HR
 * approves, all on a fake clock. The UI can also act as any volunteer. Nothing here is domain logic.
 */
export class Simulation {
  private w = createWorld({ start: START, volunteers: buildRoster() });
  private rng = mulberry32(2026);
  private plans = new Map<string, Plan>();
  private box: Record<OfficeId, number> = { OSL: 60, BLR: 55 };
  private listeners = new Set<() => void>();
  private snap: Snapshot;
  private running = false;
  private speed = DAY / 4; // sim ms per real second: 6 h/s
  private autopilot = true;
  private carry = 0;
  private busy = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private conflicts = 0;
  private toastSeq = 0;
  private toasts: Snapshot["toasts"] = [];
  private ready = false;

  constructor() {
    this.w.chat.subscribe(() => undefined);
    this.snap = this.emptySnapshot();
  }

  // ── store plumbing ──
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  private emit() {
    this.listeners.forEach((l) => l());
  }

  private emptySnapshot(): Snapshot {
    const b = (o: OfficeId) => this.w.service.budget(o);
    return {
      ready: false,
      now: this.w.clock.now(),
      month: monthKey(this.w.clock.now()),
      running: false,
      speed: this.speed,
      autopilot: true,
      hrDown: false,
      refills: [],
      budgets: { OSL: b("OSL"), BLR: b("BLR") },
      box: { ...this.box },
      volunteers: [],
      candidates: { OSL: [], BLR: [] },
      messages: [],
      reports: {},
      conflictsBlocked: 0,
      toasts: [],
    };
  }

  async init() {
    if (this.ready) return;
    // Warm-up: six weeks of history so budgets, fairness and the report have real numbers on first load.
    while (this.w.clock.now() < WARM_UP_UNTIL) await this.step(true);
    await this.seedDemo();
    this.ready = true;
    this.plans.clear();
    await this.refresh();
  }

  /**
   * Leave the app in a lived-in state on first load: every office has something happening, and the board shows
   * a declined offer being passed on, so a visitor sees the hand-over before pressing anything.
   */
  private async seedDemo() {
    const { service } = this.w;
    this.box.BLR = 9;
    if (!(await service.openRefill("BLR"))) {
      const r = await this.safe(() => service.reportEmpty({ office: "BLR", by: "BLR-02", items: ["Namkeen", "Tea & coffee"] }));
      if (r?.refill.offeredTo) await this.safe(() => service.decline(r.refill.id, r.refill.offeredTo!));
    }
    if (!(await service.openRefill("OSL"))) {
      this.box.OSL = 4;
      await this.safe(() => service.reportEmpty({ office: "OSL", by: "OSL-05", items: ["Dark chocolate"] }));
    }
  }

  async refresh() {
    const { service, clock, volunteers, ledger } = this.w;
    const refills = await service.list();
    const now = clock.now();
    const month = monthKey(now);
    const prev = monthKey(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - 1, 15));
    const rep = (m: string) =>
      monthlyReport({ month: m, refills, ledger, offices: OFFICES, volunteers, rates: this.w.rates });
    const rank = (o: OfficeId) =>
      rankCandidates({
        office: o,
        volunteers,
        refills,
        at: now,
        policy: DEFAULT_POLICY,
        rates: this.w.rates,
        exclude: [],
        officeName: (id) => OFFICES[id].name,
      });
    const candidates = { OSL: rank("OSL"), BLR: rank("BLR") };
    const open = (o: OfficeId) => refills.find((r) => r.office === o && ["OFFERED", "ESCALATED", "COMMITTED", "BUDGET_HOLD"].includes(r.state));
    const views: VolunteerView[] = volunteers.map((v) => {
      const stats = statsFor(v, refills, now, DEFAULT_POLICY, this.w.rates);
      const presence = presenceOf(v, now);
      const idx = candidates[v.homeOffice].findIndex((c) => c.volunteer.id === v.id);
      // Visitors queue for the office they are in, not their home office.
      const here = presence.kind === "office" ? presence.office : v.homeOffice;
      const idx2 = candidates[here].findIndex((c) => c.volunteer.id === v.id);
      const r = here === v.homeOffice ? idx : idx2;
      let blocker: string | undefined;
      if (r < 0) {
        if (presence.kind === "holiday") blocker = "On holiday";
        else if (presence.kind === "off") blocker = "Weekend";
        else if (stats.busy) blocker = "Already on a refill";
        else if (stats.outstandingClaims >= DEFAULT_POLICY.maxOutstandingClaims || stats.owedReportingMinor >= DEFAULT_POLICY.maxOwedReportingMinor) blocker = "Waiting on HR to pay them back";
        else if (presence.kind === "remote") blocker = availabilityTier(v, v.homeOffice, now) ? undefined : "Remote";
        else blocker = "Not available";
      }
      void open;
      return { volunteer: v, presence, stats, rank: r >= 0 ? r + 1 : null, blocker };
    });
    this.snap = {
      ready: this.ready,
      now,
      month,
      running: this.running,
      speed: this.speed,
      autopilot: this.autopilot,
      hrDown: this.w.hr.down,
      refills,
      budgets: { OSL: service.budget("OSL"), BLR: service.budget("BLR") },
      box: { ...this.box },
      volunteers: views,
      candidates,
      messages: this.w.chat.sent.slice(-80).reverse(),
      reports: { [month]: rep(month), [prev]: rep(prev) },
      conflictsBlocked: this.conflicts,
      toasts: this.toasts,
    };
    this.emit();
  }

  // ── time ──
  private pick<T>(xs: readonly T[]) {
    return xs[Math.floor(this.rng() * xs.length)];
  }

  private async botPlans() {
    const { service, clock } = this.w;
    const now = clock.now();
    const refills = await service.list();
    for (const r of refills) {
      const cfg = OFFICES[r.office];
      if (r.state === "OFFERED") {
        const key = `${r.id}:offer:${r.directOffers}`;
        if (!this.plans.has(key)) {
          const x = this.rng();
          this.plans.set(key, { at: now + (5 + this.rng() * 95) * MIN, action: x < 0.2 ? "decline" : x < 0.32 ? "ignore" : "accept" });
        }
        const p = this.plans.get(key)!;
        if (p.at <= now && p.action !== "ignore") {
          await this.safe(() => (p.action === "accept" ? service.accept(r.id, r.offeredTo!) : service.decline(r.id, r.offeredTo!)));
          this.plans.delete(key);
        }
      } else if (r.state === "ESCALATED") {
        const key = `${r.id}:esc`;
        if (!this.plans.has(key)) this.plans.set(key, { at: now + (20 + this.rng() * 160) * MIN, action: "accept" });
        const p = this.plans.get(key)!;
        if (p.at <= now) {
          const c = (await service.candidatesFor(r.office, r.excluded))[0];
          if (c) await this.safe(() => service.accept(r.id, c.volunteer.id));
          this.plans.delete(key);
        }
      } else if (r.state === "COMMITTED" && r.commit) {
        const key = `${r.id}:buy:${r.commit.by}`;
        if (!this.plans.has(key)) {
          const x = this.rng();
          this.plans.set(key, { at: now + (1 + this.rng() * 19) * HOUR, action: x < 0.1 ? "ignore" : "complete" });
        }
        const p = this.plans.get(key)!;
        if (p.at <= now && p.action === "complete") {
          const span = Math.min(cfg.typicalMaxMinor, r.commit.capMinor) - cfg.typicalMinMinor;
          const amount = Math.max(cfg.typicalMinMinor, Math.round((cfg.typicalMinMinor + this.rng() * Math.max(0, span)) / 50) * 50);
          const items = [...new Set([...r.itemsLow, this.pick(SNACK_CATALOG), this.pick(SNACK_CATALOG)])];
          await this.safe(() => service.completePurchase(r.id, r.commit!.by, { amountMinor: Math.min(amount, r.commit!.capMinor), items, receipt: `receipt-${r.id}.jpg` }));
          this.box[r.office] = 100;
          this.plans.delete(key);
        }
      }
    }
  }

  private async drain() {
    const now = this.w.clock.now();
    const d = new Date(now);
    const hour = d.getUTCHours();
    const wk = d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
    if (!wk || hour < 6 || hour >= 16) return;
    for (const o of ["OSL", "BLR"] as OfficeId[]) {
      this.box[o] = Math.max(0, this.box[o] - (o === "OSL" ? 1 : 1.45) * (0.5 + this.rng()));
      if (this.box[o] <= 3 && !(await this.w.service.openRefill(o)) && this.rng() < 0.35) {
        const present = this.w.volunteers.filter((v) => availabilityTier(v, o, now) === 1);
        const who = present.length ? this.pick(present) : this.w.volunteers.find((v) => v.homeOffice === o)!;
        const n = 1 + Math.floor(this.rng() * 3);
        const items = Array.from({ length: n }, () => this.pick(SNACK_CATALOG));
        await this.safe(() => this.w.service.reportEmpty({ office: o, by: who.id, items }));
      }
    }
  }

  private async step(silent = false) {
    this.w.clock.advance(STEP);
    await this.drain();
    await this.safe(() => this.w.service.tick());
    await this.botPlansIfAuto(silent);
  }
  private async botPlansIfAuto(silent: boolean) {
    if (this.autopilot || silent) await this.botPlans();
  }

  /** Never let a refused action (the domain doing its job) take down the simulation. */
  private async safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof DomainError && e.code === "ALREADY_TAKEN") this.conflicts++;
      return undefined;
    }
  }

  private async advanceBy(ms: number) {
    let left = ms;
    while (left > 0) {
      const slice = Math.min(STEP, left);
      if (slice < STEP) {
        this.w.clock.advance(slice);
        await this.safe(() => this.w.service.tick());
      } else await this.step();
      left -= slice;
    }
  }

  // ── controls ──
  play() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => void this.loop(), 100);
    void this.refresh();
  }
  pause() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.refresh();
  }
  setSpeed(simMsPerSecond: number) {
    this.speed = simMsPerSecond;
    void this.refresh();
  }
  setAutopilot(v: boolean) {
    this.autopilot = v;
    void this.refresh();
  }
  setHrDown(v: boolean) {
    this.w.hr.down = v;
    this.toast(v ? "warn" : "ok", v ? "HR is down: new claims will wait in the outbox" : "HR is back: queued claims go out on the next tick");
    void this.refresh();
  }
  private async loop() {
    if (this.busy || !this.running) return;
    this.busy = true;
    try {
      this.carry += this.speed / 10;
      const whole = Math.floor(this.carry / STEP) * STEP;
      if (whole > 0) {
        this.carry -= whole;
        await this.advanceBy(whole);
        await this.refresh();
      }
    } finally {
      this.busy = false;
    }
  }
  async skip(ms: number) {
    const was = this.running;
    this.pause();
    while (this.busy) await new Promise((r) => setTimeout(r, 20));
    this.busy = true;
    try {
      await this.advanceBy(ms);
    } finally {
      this.busy = false;
    }
    await this.refresh();
    if (was) this.play();
  }

  // ── acting as people ──
  toast(tone: "ok" | "warn" | "info", text: string) {
    const id = ++this.toastSeq;
    this.toasts = [...this.toasts.slice(-3), { id, tone, text }];
    this.emit();
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      void this.refresh();
    }, 4200);
  }
  private async act(label: string, fn: () => Promise<unknown>, okText?: string) {
    try {
      await fn();
      if (okText) this.toast("ok", okText);
    } catch (e) {
      if (e instanceof DomainError) {
        if (e.code === "ALREADY_TAKEN") this.conflicts++;
        this.toast("warn", e.message);
      } else this.toast("warn", `${label} failed`);
    }
    await this.refresh();
  }
  /** Returns true when the domain accepted it (so the UI can close its sheet). */
  async completeChecked(refillId: string, who: string, amountMinor: number, items: string[], leadOverride = false) {
    const before = this.conflicts;
    let ok = true;
    try {
      const r = await this.w.service.completePurchase(refillId, who, { amountMinor, items, receipt: `receipt-${refillId}.jpg`, leadOverride });
      this.box[r.office] = 100;
      this.toast("ok", r.state === "CLAIMED" ? "Claim sent to HR" : "Receipt saved, HR is down so the claim will go out automatically");
    } catch (e) {
      ok = false;
      this.toast("warn", e instanceof DomainError ? e.message : "Could not save the receipt");
    }
    void before;
    await this.refresh();
    return ok;
  }
  nameOf = (id: string) => this.w.volunteers.find((v) => v.id === id)?.name ?? id;
  report(office: OfficeId, items: string[] = []) {
    const present = this.w.volunteers.filter((v) => availabilityTier(v, office, this.w.clock.now()) === 1);
    const by = (present[0] ?? this.w.volunteers.find((v) => v.homeOffice === office)!).id;
    return this.act("Report", async () => {
      const r = await this.w.service.reportEmpty({ office, by, items });
      this.toast(r.created ? "ok" : "info", r.created ? `Refill started for ${OFFICES[office].name}` : `${OFFICES[office].name} already has an open refill, items added`);
    });
  }
  accept(refillId: string, who: string) {
    return this.act("Accept", () => this.w.service.accept(refillId, who), `${this.nameOf(who)} took the refill`);
  }
  decline(refillId: string, who: string) {
    return this.act("Decline", () => this.w.service.decline(refillId, who), "Passed to the next person");
  }
  complete(refillId: string, who: string, amountMinor: number, items: string[], leadOverride = false) {
    return this.act(
      "Complete",
      async () => {
        const r = await this.w.service.completePurchase(refillId, who, { amountMinor, items, receipt: `receipt-${refillId}.jpg`, leadOverride });
        this.box[r.office] = 100;
      },
      "Claim sent to HR",
    );
  }
  openToEveryone(refillId: string) {
    return this.act("Open", () => this.w.service.openToEveryone(refillId, "lead"), "Opened to everyone eligible");
  }
  /** Several people tap "I'll take it" at the same instant. */
  async race(refillId: string, n = 5) {
    const r = await this.w.service.get(refillId);
    if (r.state !== "ESCALATED") return this.toast("info", "Race test needs an escalated refill (use “Open to everyone” first)");
    const cands = (await this.w.service.candidatesFor(r.office, r.excluded)).slice(0, n);
    const res = await Promise.allSettled(cands.map((c) => this.w.service.accept(refillId, c.volunteer.id)));
    const won = res.filter((x) => x.status === "fulfilled").length;
    const lost = res.length - won;
    this.conflicts += lost;
    this.toast(won === 1 ? "ok" : "warn", `${cands.length} people tapped at once: ${won} got it, ${lost} politely turned away`);
    await this.refresh();
  }
  /** What the HR system sees (for the "claim" detail line). */
  hrClaim(id?: string) {
    return id ? this.w.hr.claims.get(id) : undefined;
  }
  async reset() {
    this.pause();
    this.w = createWorld({ start: START, volunteers: buildRoster() });
    this.rng = mulberry32(2026);
    this.plans.clear();
    this.box = { OSL: 60, BLR: 55 };
    this.conflicts = 0;
    this.ready = false;
    this.toasts = [];
    this.snap = this.emptySnapshot();
    this.emit();
    await this.init();
  }
}
