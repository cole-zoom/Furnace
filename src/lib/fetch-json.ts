/**
 * Read a JSON response without assuming it is one.
 *
 * Parsing before checking `res.ok` is the trap: a platform-level timeout or
 * gateway error returns HTML, `res.json()` throws a SyntaxError, and the
 * `!res.ok` branch never runs — so the reader gets `Unexpected token '<'`
 * instead of anything they can act on. Every API call in this app goes through
 * here so that failure mode can't come back.
 */
export async function readJson<T = Record<string, unknown>>(
  res: Response,
): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  const isJson = res.headers.get("content-type")?.includes("application/json");

  let data: T | null = null;
  if (isJson) {
    try {
      data = (await res.json()) as T;
    } catch {
      data = null;
    }
  }

  if (res.ok) return { ok: true, data, error: null };

  const body = data as { message?: string; error?: string } | null;
  return {
    ok: false,
    data,
    error:
      body?.message ??
      body?.error ??
      // 504s and the like carry no usable body; name the status instead.
      (res.status === 504
        ? "That took too long and timed out. Try again, or shorten the transcript."
        : `Request failed (${res.status} ${res.statusText || "error"}).`),
  };
}
