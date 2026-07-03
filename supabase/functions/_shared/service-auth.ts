// Shared caller-verification helpers for edge functions.
//
// Platform-level verify_jwt only proves the caller holds *a* valid JWT — the
// public anon key passes it. Any function that reads or writes another user's
// data, spends AI/Etsy quota, or runs pipeline work must verify the caller
// itself with one of these helpers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** True when the Authorization bearer is the service-role key (internal chain calls, pg_cron). */
export function isServiceCall(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  return Boolean(serviceKey && authHeader === `Bearer ${serviceKey}`);
}

/** True when the request carries the scheduler's x-cron-trigger secret. */
export function isCronCall(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-trigger");
  return Boolean(cronSecret && incoming === cronSecret);
}

/** Service-role or cron-secret — the gate for pipeline/scheduled functions. */
export function isServiceOrCronCall(req: Request): boolean {
  return isServiceCall(req) || isCronCall(req);
}

/**
 * Resolves the calling user's id from their JWT, or null.
 * Uses the service client purely to validate the token — no data access.
 */
export async function callerUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data } = await sb.auth.getUser(token);
  return data?.user?.id ?? null;
}

/** True when the caller is an authenticated user with the 'admin' role. */
export async function isAdminCall(req: Request): Promise<boolean> {
  const userId = await callerUserId(req);
  if (!userId) return false;
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !error && Boolean(data);
}
