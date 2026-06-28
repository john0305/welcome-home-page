// Admin-only user management endpoint.
// Actions: get_details, lock, unlock, send_password_reset, reset_own_password
//
// Authorization: caller must have the 'admin' role (verified via has_role RPC).
// All write actions are also blocked from targeting the caller's own account
// EXCEPT `reset_own_password`, which is the explicit self-service action.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | "get_details"
  | "list_auth_meta"
  | "lock"
  | "unlock"
  | "send_password_reset"
  | "reset_own_password"
  | "update_profile";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: userRes } = await sb.auth.getUser(token);
    const caller = userRes?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin, error: roleErr } = await sb.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action | undefined;
    const targetUserId = body?.user_id as string | undefined;
    const redirectTo = (body?.redirect_to as string | undefined) ?? undefined;

    if (!action) return json({ error: "Missing action" }, 400);

    // ── Self-service: reset the admin's own password ──────────────────────
    if (action === "reset_own_password") {
      const email = caller.email;
      if (!email) return json({ error: "Admin account has no email" }, 400);
      const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { error: resetErr } = await anon.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo,
      });
      if (resetErr) return json({ error: resetErr.message }, 500);
      return json({ ok: true, email });
    }

    // ── Bulk auth metadata (last_sign_in_at + banned_until + active listing counts) ──
    if (action === "list_auth_meta") {
      const meta: Record<string, { last_sign_in_at: string | null; banned_until: string | null }> = {};
      // Paginate through all auth users
      let page = 1;
      const perPage = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
        if (error) return json({ error: error.message }, 500);
        for (const u of data.users) {
          meta[u.id] = {
            last_sign_in_at: u.last_sign_in_at ?? null,
            banned_until: (u as { banned_until?: string }).banned_until ?? null,
          };
        }
        if (data.users.length < perPage) break;
        page += 1;
        if (page > 50) break; // safety cap (50k users)
      }
      // Active listing counts grouped by user
      const { data: listingRows } = await sb
        .from("listings")
        .select("user_id")
        .eq("state", "active");
      const listingCounts: Record<string, number> = {};
      for (const r of (listingRows ?? []) as { user_id: string }[]) {
        listingCounts[r.user_id] = (listingCounts[r.user_id] ?? 0) + 1;
      }
      return json({ meta, listing_counts: listingCounts });
    }


    if (!targetUserId) return json({ error: "Missing user_id" }, 400);

    // Block destructive self-targeting (except reset_own_password handled above)
    if (targetUserId === caller.id && action !== "get_details") {
      return json({ error: "Cannot perform this action on your own account" }, 400);
    }

    switch (action) {
      case "get_details": {
        const [profileRes, authRes, storesRes, listingsRes, subRes, usageRes] = await Promise.all([
          sb.from("user_profiles").select("*").eq("id", targetUserId).maybeSingle(),
          sb.auth.admin.getUserById(targetUserId),
          sb.from("stores").select("id, shop_name, etsy_shop_id, connected_at, last_synced, listing_count").eq("user_id", targetUserId),
          sb.from("listings").select("id", { count: "exact", head: true }).eq("user_id", targetUserId).eq("state", "active"),
          sb.from("subscriptions").select("*").eq("user_id", targetUserId).order("created_at", { ascending: false }),
          sb.from("monthly_usage").select("month, optimizations_used, grades_used, chat_messages_used").eq("user_id", targetUserId).order("month", { ascending: false }).limit(6),
        ]);

        const authUser = authRes.data?.user;
        return json({
          profile: profileRes.data,
          auth: authUser ? {
            id: authUser.id,
            email: authUser.email,
            phone: authUser.phone,
            created_at: authUser.created_at,
            last_sign_in_at: authUser.last_sign_in_at,
            email_confirmed_at: authUser.email_confirmed_at,
            banned_until: (authUser as { banned_until?: string }).banned_until ?? null,
            providers: authUser.app_metadata?.providers ?? [],
            user_metadata: authUser.user_metadata ?? {},
          } : null,
          stores: storesRes.data ?? [],
          active_listings: listingsRes.count ?? 0,
          subscriptions: subRes.data ?? [],
          recent_usage: usageRes.data ?? [],
        });
      }

      case "lock": {
        // 100 years — effectively permanent until unlock
        const { error } = await sb.auth.admin.updateUserById(targetUserId, {
          ban_duration: "876000h",
        } as never);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "unlock": {
        const { error } = await sb.auth.admin.updateUserById(targetUserId, {
          ban_duration: "none",
        } as never);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "send_password_reset": {
        const { data: profile } = await sb
          .from("user_profiles")
          .select("email")
          .eq("id", targetUserId)
          .maybeSingle();
        if (!profile?.email) return json({ error: "Target has no email" }, 404);
        const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
        const { error: resetErr } = await anon.auth.resetPasswordForEmail(profile.email, {
          redirectTo: redirectTo,
        });
        if (resetErr) return json({ error: resetErr.message }, 500);
        return json({ ok: true, email: profile.email });
      }

      case "update_profile": {
        const updates = (body?.updates ?? {}) as Record<string, unknown>;
        const allowed = ["full_name", "username", "tier", "is_affiliate", "avatar_url"];
        const patch: Record<string, unknown> = {};
        for (const k of allowed) {
          if (k in updates) patch[k] = updates[k];
        }
        if (Object.keys(patch).length === 0) return json({ error: "No updatable fields" }, 400);
        const { error } = await sb.from("user_profiles").update(patch).eq("id", targetUserId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, updated: patch });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
