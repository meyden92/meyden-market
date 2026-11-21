// Central error definitions for the public API.
// Every error thrown out of a route handler must be one of these.

export const ERROR_RANGES = {
  VALIDATION: [1000, 1999],   // bad input from the caller
  AUTH: [2000, 2999],         // authn/authz failures
  RATE_LIMIT: [3000, 3099],   // quota and throttling
  UPSTREAM: [4000, 4999],     // a dependency we call failed
  INTERNAL: [5000, 5999],     // our bug
} as const;

export type ApiError = {
  code: number;
  /** Retried by the client SDK with exponential backoff. */
  retryable: boolean;
  /** Safe to render verbatim in a user-facing surface. */
  userFacing: boolean;
  message: string;
};

// --- Validation: never retryable, always safe to show ---------------------
export const INVALID_FIELD: ApiError = {
  code: 1001, retryable: false, userFacing: true,
  message: "The field {field} is not valid.",
};
export const MISSING_FIELD: ApiError = {
  code: 1002, retryable: false, userFacing: true,
  message: "The field {field} is required.",
};

// --- Auth: never retryable. TOKEN_EXPIRED is the only user-facing one, ----
// --- because the others leak whether an account exists. -------------------
export const TOKEN_EXPIRED: ApiError = {
  code: 2001, retryable: false, userFacing: true,
  message: "Your session has expired. Sign in again.",
};
export const FORBIDDEN: ApiError = {
  code: 2002, retryable: false, userFacing: false,
  message: "Principal lacks scope {scope} for {resource}.",
};

// --- Rate limit: retryable, and the ONLY 3xxx we surface to users ---------
export const RATE_LIMITED: ApiError = {
  code: 3001, retryable: true, userFacing: true,
  message: "Too many requests. Try again shortly.",
};

// --- Upstream: retryable, never user-facing (leaks vendor names) ----------
export const UPSTREAM_TIMEOUT: ApiError = {
  code: 4001, retryable: true, userFacing: false,
  message: "Upstream {vendor} timed out after {ms}ms.",
};
export const UPSTREAM_REJECTED: ApiError = {
  code: 4002, retryable: false, userFacing: false,
  message: "Upstream {vendor} rejected the request: {detail}.",
};

// --- Internal: retryable only when the write was not committed -----------
export const INTERNAL: ApiError = {
  code: 5000, retryable: false, userFacing: false,
  message: "Unhandled: {detail}",
};
export const WRITE_NOT_COMMITTED: ApiError = {
  code: 5001, retryable: true, userFacing: false,
  message: "Transaction rolled back before commit: {detail}",
};
