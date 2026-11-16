export type DomainErrorCode =
  | "ALREADY_TAKEN"
  | "NOT_ALLOWED"
  | "INVALID_STATE"
  | "BUDGET_EXCEEDED"
  | "NOT_FOUND"
  | "INVALID_INPUT";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Thrown by the repo when the version the caller read is no longer the stored one. */
export class VersionConflict extends Error {
  constructor(public readonly id: string) {
    super(`Version conflict on ${id}`);
    this.name = "VersionConflict";
  }
}

/** Thrown by an HR adapter when the other company's system is down; the claim is retried later. */
export class HrUnavailableError extends Error {
  constructor(message = "HR system unavailable") {
    super(message);
    this.name = "HrUnavailableError";
  }
}
