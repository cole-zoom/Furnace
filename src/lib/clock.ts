import "server-only";

/**
 * The current time, read once per request.
 *
 * `Date.now()` is impure, and react-hooks/purity is right to flag it inside a
 * component — a clock that changes between renders makes a component's output
 * unstable. That reasoning doesn't apply to a dynamic Server Component, which
 * renders exactly once per request and is *supposed* to reflect the moment the
 * request arrived; the value is constant for the whole render and is passed to
 * the client as a plain prop.
 *
 * Isolated here rather than suppressed at the call site, so the lint keeps its
 * teeth everywhere it's actually telling the truth, and so there's one place to
 * look if request-time ever needs to come from somewhere else.
 */
export function requestTime(): number {
  return Date.now();
}
