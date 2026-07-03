// Admin-only: impersonation ("sign in as user") with a mandatory audit trail.
//
// action 'start' (default): verifies the caller is an admin, writes an
//   impersonation_sessions audit row (who, whom, when, intended expiry),
//   then generates a magic link for the target user. The redirect carries
//   ?impersonation=<session_id> so the client can show a persistent
//   "Viewing as" banner and enforce the 30-minute window.
// action 'end': stamps ended_at on the audit row (called by the banner's
//   "End session" button and the auto-timeout).
//
// Etsy/API tokens are unaffected: they live server-side in etsy_tokens and
// are only ever read inside edge functions, impersonating admin or not.
//
// Known limitation (accepted, documented in ARCHITECTURE.md): the magic-link
// session is a standard Supabase user session — the 30-minute limit is
// client-enforced. Hard server-side revocation would need custom JWT infra.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SESSION_MINUTES = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: userRes } = await sb.auth.getUser(token);
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const adminId = userRes.user.id;

    const { data: isAdmin, error: roleErr } = await sb.rpc("has_role", {
      _user_id: adminId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = (body?.action as string | undefined) ?? "start";

    if (action === "end") {
      const sessionId = body?.session_id as string | undefined;
      if (!sessionId) return json({ error: "Missing session_id" }, 400);
      const { error: endErr } = await sb
        .from("impersonation_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId)
        .is("ended_at", null);
      if (endErr) return json({ error: endErr.message }, 500);
      return json({ ok: true });
    }

    const targetUserId = body?.user_id as string | undefined;
    const redirectTo = (body?.redirect_to as string | undefined) ?? undefined;
    if (!targetUserId) return json({ error: "Missing user_id" }, 400);
    if (targetUserId === adminId) return json({ error: "Cannot impersonate yourself" }, 400);

    // Look up target email
    const { data: profile, error: pErr } = await sb
      .from("user_profiles")
      .select("email")
      .eq("id", targetUserId)
      .maybeSingle();

    if (pErr || !profile?.email) return json({ error: "Target user not found or has no email" }, 404);

    // Audit row FIRST — if this fails, no link is issued.
    const { data: auditRow, error: auditErr } = await sb
      .from("impersonation_sessions")
      .insert({
        admin_user_id: adminId,
        target_user_id: targetUserId,
        target_email: profile.email,
        expires_at: new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString(),
      })
      .select("id, expires_at")
      .single();
    if (auditErr || !auditRow) {
      return json({ error: `Audit log write failed: ${auditErr?.message}` }, 500);
    }

    // Redirect carries the audit session id so the client can show the
    // persistent "Viewing as" banner and enforce the timeout.
    const base = redirectTo ?? "";
    const sep = base.includes("?") ? "&" : "?";
    const redirectWithMarker = base
      ? `${base}${sep}impersonation=${auditRow.id}`
      : undefined;

    const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
      options: redirectWithMarker ? { redirectTo: redirectWithMarker } : undefined,
    });

    if (linkErr || !link?.properties?.action_link) {
      // Mark the audit row as never-used rather than leaving it open.
      await sb.from("impersonation_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", auditRow.id);
      return json({ error: linkErr?.message ?? "Failed to generate link" }, 500);
    }

    return json({
      action_link: link.properties.action_link,
      email: profile.email,
      session_id: auditRow.id,
      expires_at: auditRow.expires_at,
    });
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
