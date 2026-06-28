import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tier rank — higher = more expensive
const TIER_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  agency: 3,
};

const PRICE_TO_TIER: Record<string, string> = {
  starter_monthly: 'starter', starter_yearly: 'starter',
  pro_monthly: 'pro', pro_yearly: 'pro',
  agency_monthly: 'agency', agency_yearly: 'agency',
  starter_monthly_v2: 'starter', starter_yearly_v2: 'starter',
  pro_monthly_v2: 'pro', pro_yearly_v2: 'pro',
  agency_monthly_v2: 'agency', agency_yearly_v2: 'agency',
};

function isYearly(priceId: string) {
  return priceId.endsWith('_yearly') || priceId.endsWith('_yearly_v2');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { newPriceId, action, environment } = await req.json();
    if (environment !== 'sandbox' && environment !== 'live') {
      throw new Error("Invalid environment");
    }
    const env: StripeEnv = environment;

    // Find user's current active subscription row
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, price_id")
      .eq("user_id", user.id)
      .eq("environment", env)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.stripe_subscription_id) {
      throw new Error("No active subscription to change. Use checkout instead.");
    }

    const stripe = createStripeClient(env);

    // Cancel / resume actions don't require a price
    if (action === 'cancel') {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
      return new Response(JSON.stringify({ ok: true, change: 'cancel' }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === 'resume') {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: false,
      });
      // Clear any pending plan change too
      await supabase.from('subscriptions')
        .update({ pending_price_id: null, pending_tier: null, pending_change_at: null })
        .eq('stripe_subscription_id', sub.stripe_subscription_id);
      return new Response(JSON.stringify({ ok: true, change: 'resume' }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!newPriceId || !/^[a-zA-Z0-9_-]+$/.test(newPriceId)) {
      throw new Error("Invalid newPriceId");
    }
    if (newPriceId === sub.price_id) {
      throw new Error("You're already on this plan");
    }

    // Resolve new Stripe price via lookup_key
    const prices = await stripe.prices.list({ lookup_keys: [newPriceId] });
    if (!prices.data.length) throw new Error("New price not found");
    const newPrice = prices.data[0];

    // Determine upgrade vs downgrade
    const currentTier = TIER_RANK[PRICE_TO_TIER[sub.price_id ?? ''] ?? 'free'] ?? 0;
    const newTier = TIER_RANK[PRICE_TO_TIER[newPriceId] ?? 'free'] ?? 0;
    const currentYearly = isYearly(sub.price_id ?? '');
    const newYearly = isYearly(newPriceId);
    let isUpgrade = newTier > currentTier;
    if (newTier === currentTier) isUpgrade = newYearly && !currentYearly;

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const itemId = stripeSub.items.data[0].id;

    // If the subscription is already attached to a schedule (e.g. a previously
    // scheduled downgrade), release it first so we can mutate the subscription
    // directly or attach a fresh schedule.
    if (stripeSub.schedule) {
      const scheduleId = typeof stripeSub.schedule === 'string'
        ? stripeSub.schedule
        : stripeSub.schedule.id;
      try {
        await stripe.subscriptionSchedules.release(scheduleId);
      } catch (e) {
        console.warn('Failed to release existing schedule', scheduleId, e);
      }
    }

    if (isUpgrade) {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ id: itemId, price: newPrice.id }],
        proration_behavior: 'always_invoice',
        cancel_at_period_end: false,
      });
      // Upgrade is immediate — clear any previously scheduled change
      await supabase.from('subscriptions')
        .update({ pending_price_id: null, pending_tier: null, pending_change_at: null })
        .eq('stripe_subscription_id', sub.stripe_subscription_id);
    } else {
      const schedule = await stripe.subscriptionSchedules.create({
        from_subscription: sub.stripe_subscription_id,
      });
      const currentPhase = schedule.phases[0];
      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        phases: [
          {
            items: currentPhase.items.map(i => ({
              price: typeof i.price === 'string' ? i.price : i.price.id,
              quantity: i.quantity,
            })),
            start_date: currentPhase.start_date,
            end_date: currentPhase.end_date,
            proration_behavior: 'none',
          },
          {
            items: [{ price: newPrice.id, quantity: 1 }],
            proration_behavior: 'none',
          },
        ],
      });
      // Record pending downgrade so the UI can surface it
      const effectiveAt = currentPhase.end_date
        ? new Date(currentPhase.end_date * 1000).toISOString()
        : null;
      await supabase.from('subscriptions')
        .update({
          pending_price_id: newPriceId,
          pending_tier: PRICE_TO_TIER[newPriceId] ?? null,
          pending_change_at: effectiveAt,
        })
        .eq('stripe_subscription_id', sub.stripe_subscription_id);
    }


    return new Response(JSON.stringify({ ok: true, change: isUpgrade ? 'upgrade' : 'downgrade' }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("change-subscription error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
