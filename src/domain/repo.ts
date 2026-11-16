import { VersionConflict } from "./errors";
import type { RefillRepo } from "./ports";
import { OPEN_STATES, type Refill } from "./types";

/**
 * In-memory repo with real compare-and-set semantics. Reads yield to the event loop (like a database round trip),
 * so two concurrent callers really do read the same version before either writes.
 */
export class InMemoryRefillRepo implements RefillRepo {
  private rows = new Map<string, Refill>();

  async get(id: string) {
    await Promise.resolve();
    const r = this.rows.get(id);
    return r ? structuredClone(r) : undefined;
  }
  async list() {
    await Promise.resolve();
    return [...this.rows.values()].map((r) => structuredClone(r));
  }
  async insert(refill: Refill) {
    await Promise.resolve();
    if (this.rows.has(refill.id)) throw new VersionConflict(refill.id);
    // Emulates a partial unique index: at most ONE open refill per office, so two "it's empty" reports at the
    // same moment can never produce two shopping trips.
    if (OPEN_STATES.includes(refill.state)) {
      for (const r of this.rows.values()) {
        if (r.office === refill.office && OPEN_STATES.includes(r.state)) throw new VersionConflict(refill.id);
      }
    }
    this.rows.set(refill.id, structuredClone(refill));
  }
  async save(next: Refill, expectedVersion: number) {
    await Promise.resolve();
    const cur = this.rows.get(next.id);
    if (!cur || cur.version !== expectedVersion) throw new VersionConflict(next.id);
    this.rows.set(next.id, structuredClone({ ...next, version: expectedVersion + 1 }));
  }
}
