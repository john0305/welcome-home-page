/**
 * Server-side fix_lifecycle helpers. Used by edge functions (apply-fix-action,
 * generate-fix-action) and by snapshot reconcile jobs.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type FixField = "title" | "tags" | "price" | "photos" | "description" | "quantity" | "shipping";
export type FixStatus = "open" | "applied" | "monitoring" | "reopened";
export type FixSource = "market_score" | "optimize_dialog" | "action_engine" | "manual";

export function factorKeyToField(factorKey: string | null | undefined): FixField | null {
  if (!factorKey) return null;
  const k = factorKey.toLowerCase();
  if (k.includes("title")) return "title";
  if (k.includes("tag")) return "tags";
  if (k.includes("photo") || k.includes("image")) return "photos";
  if (k.includes("description")) return "description";
  if (k.includes("price")) return "price";
  if (k.includes("quantity") || k.includes("stock")) return "quantity";
  if (k.includes("shipping")) return "shipping";
  return null;
}

export function makeService(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function openFixServer(supabase: SupabaseClient, input: {
  user_id: string;
  listing_id: string;
  shop_id: string;
  field: FixField;
  issue_description?: string | null;
  suggested_fix?: string | null;
  source: FixSource;
  before_value?: string | null;
}): Promise<void> {
  const { data: existing } = await supabase
    .from("fix_lifecycle")
    .select("id")
    .eq("listing_id", input.listing_id)
    .eq("field", input.field)
    .in("status", ["open", "reopened"])
    .maybeSingle();
  if (existing?.id) return;
  await supabase.from("fix_lifecycle").insert({
    user_id: input.user_id,
    listing_id: input.listing_id,
    shop_id: input.shop_id,
    field: input.field,
    issue_description: input.issue_description ?? null,
    suggested_fix: input.suggested_fix ?? null,
    source: input.source,
    before_value: input.before_value ?? null,
    status: "open",
  });
}

export async function markAppliedServer(supabase: SupabaseClient, input: {
  user_id: string;
  listing_id: string;
  shop_id: string;
  field: FixField;
  source: FixSource;
  before_value?: string | null;
  after_value?: string | null;
  dismissed?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  // Dedupe: include applied/monitoring rows so we update in place instead of
  // inserting a duplicate "Title — Applied" row on repeated writes.
  const { data: existing } = await supabase
    .from("fix_lifecycle")
    .select("id, before_value")
    .eq("listing_id", input.listing_id)
    .eq("field", input.field)
    .in("status", ["open", "reopened", "applied", "monitoring"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    await supabase
      .from("fix_lifecycle")
      .update({
        status: "applied",
        applied_at: now,
        after_value: input.after_value ?? null,
        before_value: existing.before_value ?? input.before_value ?? null,
        dismissed: input.dismissed ?? false,
      })
      .eq("id", existing.id);
    return;
  }
  await supabase.from("fix_lifecycle").insert({
    user_id: input.user_id,
    listing_id: input.listing_id,
    shop_id: input.shop_id,
    field: input.field,
    source: input.source,
    status: "applied",
    before_value: input.before_value ?? null,
    after_value: input.after_value ?? null,
    applied_at: now,
    dismissed: input.dismissed ?? false,
  });
}

/**
 * Reconcile lifecycle rows for a freshly-synced listing.
 * `getFieldValue(field)` returns the current value as a string (or null).
 */
export async function reconcileFixLifecycle(
  supabase: SupabaseClient,
  args: {
    listing_id: string;
    listing_title?: string | null;
    user_id: string;
    getFieldValue: (field: FixField) => string | null;
  },
): Promise<{ reopened: FixField[] }> {
  const reopened: FixField[] = [];
  const { data: rows } = await supabase
    .from("fix_lifecycle")
    .select("id, field, after_value, status, reopened_count")
    .eq("listing_id", args.listing_id)
    .in("status", ["applied", "monitoring"]);

  for (const row of (rows ?? []) as Array<{ id: string; field: FixField; after_value: string | null; status: string; reopened_count: number }>) {
    const current = args.getFieldValue(row.field);
    const matches = current !== null && row.after_value !== null && current === row.after_value;
    if (matches) {
      await supabase.from("fix_lifecycle").update({
        status: "monitoring",
        last_monitored_at: new Date().toISOString(),
      }).eq("id", row.id);
    } else {
      await supabase.from("fix_lifecycle").update({
        status: "reopened",
        reopened_count: (row.reopened_count ?? 0) + 1,
      }).eq("id", row.id);
      reopened.push(row.field);
      // Surface as a traction event so the bell picks it up.
      await supabase.from("listing_traction_events").insert({
        user_id: args.user_id,
        listing_id: args.listing_id,
        event_type: "fix_regressed",
        payload: { field: row.field, listing_title: args.listing_title ?? null },
      });
    }
  }
  return { reopened };
}
