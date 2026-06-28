import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
  }
  return _supabase;
}

// Map price_id (lookup_key) → user tier
const PRICE_TO_TIER: Record<string, string> = {
  starter_monthly: 'starter',
  starter_yearly: 'starter',
  pro_monthly: 'pro',
  pro_yearly: 'pro',
  agency_monthly: 'agency',
  agency_yearly: 'agency',
  starter_monthly_v2: 'starter',
  starter_yearly_v2: 'starter',
  pro_monthly_v2: 'pro',
  pro_yearly_v2: 'pro',
  agency_monthly_v2: 'agency',
  agency_yearly_v2: 'agency',
};

function resolvePriceId(item: any): string {
  return item?.price?.lookup_key
    || item?.price?.metadata?.lovable_external_id
    || item?.price?.id;
}

async function handleSubscriptionCreatedOrUpdated(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("No userId in subscription metadata", subscription.id);
    return;
  }

  const item = subscription.items?.data?.[0];
  const priceId = resolvePriceId(item);
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  const sb = getSupabase();

  // Look up any pending plan change we recorded — if Stripe has applied it
  // (or the schedule is gone), clear those fields so the UI stops showing
  // a "switching soon" banner.
  const { data: existing } = await sb.from('subscriptions')
    .select('pending_price_id')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle();

  const clearPending =
    existing?.pending_price_id != null &&
    (existing.pending_price_id === priceId || !subscription.schedule);

  await sb.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId,
      price_id: priceId,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      environment: env,
      updated_at: new Date().toISOString(),
      ...(clearPending && { pending_price_id: null, pending_tier: null, pending_change_at: null }),
    },
    { onConflict: "stripe_subscription_id" }
  );

  // Sync user_profiles.tier — only update tier on live env so test purchases
  // don't change the production tier. In sandbox we still update so preview
  // testing reflects correctly.
  const tier = PRICE_TO_TIER[priceId] ?? 'free';
  const isActive = ['active', 'trialing', 'past_due'].includes(subscription.status);
  await sb.from('user_profiles')
    .update({ tier: isActive ? tier : 'free' })
    .eq('id', userId);
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  const sb = getSupabase();
  await sb.from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);

  const userId = subscription.metadata?.userId;
  if (userId) {
    await sb.from('user_profiles').update({ tier: 'free' }).eq('id', userId);
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  console.log('webhook event:', event.type);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionCreatedOrUpdated(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    console.error("invalid env query parameter:", rawEnv);
    return new Response(JSON.stringify({ received: true, ignored: "invalid env" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    await handleWebhook(req, rawEnv);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});
