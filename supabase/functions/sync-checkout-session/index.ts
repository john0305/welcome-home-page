import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRICE_TO_TIER: Record<string, string> = {
  starter_monthly: "starter",
  starter_yearly: "starter",
  pro_monthly: "pro",
  pro_yearly: "pro",
  agency_monthly: "agency",
  agency_yearly: "agency",
  starter_monthly_v2: "starter",
  starter_yearly_v2: "starter",
  pro_monthly_v2: "pro",
  pro_yearly_v2: "pro",
  agency_monthly_v2: "agency",
  agency_yearly_v2: "agency",
};

function resolvePriceId(item: any): string {
  return item?.price?.lookup_key
    || item?.price?.metadata?.lovable_external_id
    || item?.price?.id;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { sessionId, environment } = await req.json();
    if (!sessionId || typeof sessionId !== "string" || !/^cs_/.test(sessionId)) {
      return json({ error: "Invalid sessionId" }, 400);
    }
    if (environment !== "sandbox" && environment !== "live") {
      return json({ error: "Invalid environment" }, 400);
    }

    const env = environment as StripeEnv;
    const stripe = createStripeClient(env);
    const session: any = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.items.data.price"],
    });

    const subscription = typeof session.subscription === "string"
      ? await stripe.subscriptions.retrieve(session.subscription, { expand: ["items.data.price"] })
      : session.subscription;

    const userId = session.metadata?.userId || subscription?.metadata?.userId;
    if (!userId || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
      return json({ error: "Checkout session is not linked to a user" }, 400);
    }
    if (!subscription?.id) return json({ error: "No subscription found for checkout session" }, 400);

    const item = subscription.items?.data?.[0];
    const priceId = resolvePriceId(item);
    const tier = PRICE_TO_TIER[priceId] ?? "free";
    const isActive = ["active", "trialing", "past_due"].includes(subscription.status);
    const periodStart = item?.current_period_start ?? subscription.current_period_start;
    const periodEnd = item?.current_period_end ?? subscription.current_period_end;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: upsertError } = await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        product_id: item?.price?.product,
        price_id: priceId,
        status: subscription.status,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );
    if (upsertError) throw upsertError;

    const { error: profileError } = await supabase
      .from("user_profiles")
      .update({ tier: isActive ? tier : "free" })
      .eq("id", userId);
    if (profileError) throw profileError;

    return json({ ok: true, tier: isActive ? tier : "free", status: subscription.status });
  } catch (e) {
    console.error("sync-checkout-session error:", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});