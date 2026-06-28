// Hybrid AI dispatcher — routes chat/completion calls to either the
// Lovable AI Gateway (Gemini/GPT) or Anthropic Claude based on the
// per-task configuration stored in the `ai_model_config` table.
//
// Falls back gracefully to Gemini equivalents when ANTHROPIC_API_KEY
// is missing. 60-second in-memory cache per edge function instance.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type TaskKey =
  | "listing_grading"
  | "tag_generation"
  | "bulk_grading"
  | "listing_rewrite"
  | "echo_chat"
  | "nightly_queue"
  | "admin_echo"
  | "niche_classification"
  | "market_title_suggest"
  | "market_keyword_gen"
  | "dashboard_briefing"
  | "demo_chat";

export interface ModelConfig {
  task_key: TaskKey;
  provider: "gateway" | "anthropic";
  model: string;
  batch_enabled: boolean;
}

const DEFAULTS: Record<TaskKey, ModelConfig> = {
  listing_grading: { task_key: "listing_grading", provider: "gateway", model: "google/gemini-2.5-flash", batch_enabled: false },
  tag_generation:  { task_key: "tag_generation",  provider: "gateway", model: "google/gemini-2.5-flash", batch_enabled: false },
  bulk_grading:    { task_key: "bulk_grading",    provider: "gateway", model: "google/gemini-2.5-flash", batch_enabled: false },
  listing_rewrite: { task_key: "listing_rewrite", provider: "anthropic", model: "claude-sonnet-4-6", batch_enabled: false },
  echo_chat:       { task_key: "echo_chat",       provider: "anthropic", model: "claude-sonnet-4-6", batch_enabled: false },
  nightly_queue:        { task_key: "nightly_queue",        provider: "anthropic", model: "claude-haiku-4-5",  batch_enabled: true  },
  admin_echo:           { task_key: "admin_echo",           provider: "anthropic", model: "claude-sonnet-4-6", batch_enabled: false },
  niche_classification: { task_key: "niche_classification", provider: "gateway",   model: "google/gemini-2.5-flash", batch_enabled: false },
  market_title_suggest: { task_key: "market_title_suggest", provider: "anthropic", model: "claude-sonnet-4-6", batch_enabled: false },
  market_keyword_gen:   { task_key: "market_keyword_gen",   provider: "gateway",   model: "google/gemini-2.5-flash", batch_enabled: false },
  dashboard_briefing:   { task_key: "dashboard_briefing",   provider: "anthropic", model: "claude-haiku-4-5",        batch_enabled: false },
  demo_chat:            { task_key: "demo_chat",            provider: "gateway",   model: "google/gemini-2.5-flash-lite", batch_enabled: false },
};

// Anthropic → Gemini fallback when ANTHROPIC_API_KEY is missing
const ANTHROPIC_FALLBACK: Record<string, { provider: "gateway"; model: string }> = {
  "claude-sonnet-4-6":  { provider: "gateway", model: "google/gemini-2.5-pro" },
  "claude-sonnet-4-5":  { provider: "gateway", model: "google/gemini-2.5-pro" },
  "claude-opus-4-7":    { provider: "gateway", model: "google/gemini-2.5-pro" },
  "claude-opus-4-5":    { provider: "gateway", model: "google/gemini-2.5-pro" },
  "claude-haiku-4-5":   { provider: "gateway", model: "google/gemini-2.5-flash" },
};

// 60-second in-memory cache (per edge-function instance)
const cache = new Map<TaskKey, { value: ModelConfig; expires: number }>();
const TTL_MS = 60_000;

export async function getModelFor(taskKey: TaskKey): Promise<ModelConfig> {
  const cached = cache.get(taskKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await admin
    .from("ai_model_config")
    .select("task_key, provider, model, batch_enabled")
    .eq("task_key", taskKey)
    .maybeSingle();

  let cfg: ModelConfig = (!error && data ? data : DEFAULTS[taskKey]) as ModelConfig;

  // Anthropic fallback if key missing
  if (cfg.provider === "anthropic" && !Deno.env.get("ANTHROPIC_API_KEY")) {
    const fb = ANTHROPIC_FALLBACK[cfg.model] ?? { provider: "gateway" as const, model: "google/gemini-2.5-flash" };
    console.warn(`[ai-dispatch] ANTHROPIC_API_KEY missing — ${taskKey} falling back from ${cfg.model} → ${fb.model}`);
    cfg = { ...cfg, provider: fb.provider, model: fb.model };
  }

  cache.set(taskKey, { value: cfg, expires: Date.now() + TTL_MS });
  return cfg;
}

export interface ChatMessage { role: "user" | "assistant" | "system"; content: string; }

export interface ChatOptions {
  taskKey: TaskKey;
  /** System prompt. For Anthropic with cacheSystem, pass as a single string —
   *  the dispatcher splits it on the marker `\n\n<<<DYNAMIC_CONTEXT>>>\n\n`
   *  so the prefix is cached and the suffix isn't. Without the marker,
   *  the whole system block is cached. */
  system?: string;
  messages: ChatMessage[];
  /** When true and provider is anthropic, marks the system prompt as ephemeral-cached. */
  cacheSystem?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Optional — user the call is attributed to. Used for admin token/cost reporting. */
  userId?: string | null;
}

export interface ChatResult {
  content: string;
  provider: "gateway" | "anthropic";
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  /** Set when provider returned a non-2xx — caller may inspect status / error. */
  error?: { status: number; message: string };
}

// ── Pricing (USD per 1M tokens). Approximate public list prices; keep in sync with provider docs. ──
// [inputPer1M, outputPer1M, cacheReadPer1M, cacheWritePer1M]
const PRICING: Record<string, [number, number, number, number]> = {
  // Anthropic
  "claude-sonnet-4-6":   [3.00, 15.00, 0.30, 3.75],
  "claude-sonnet-4-5":   [3.00, 15.00, 0.30, 3.75],
  "claude-opus-4-7":     [15.00, 75.00, 1.50, 18.75],
  "claude-opus-4-5":     [15.00, 75.00, 1.50, 18.75],
  "claude-haiku-4-5":    [1.00, 5.00, 0.10, 1.25],
  // Lovable Gateway / Google
  "google/gemini-2.5-pro":         [1.25, 10.00, 0, 0],
  "google/gemini-2.5-flash":       [0.30, 2.50, 0, 0],
  "google/gemini-2.5-flash-lite":  [0.10, 0.40, 0, 0],
  // OpenAI
  "openai/gpt-5":      [1.25, 10.00, 0, 0],
  "openai/gpt-5-mini": [0.25, 2.00, 0, 0],
  "openai/gpt-5-nano": [0.05, 0.40, 0, 0],
};

export function estimateCostUsd(model: string, usage?: ChatResult["usage"]): number {
  if (!usage) return 0;
  const p = PRICING[model];
  if (!p) return 0;
  const [inP, outP, crP, cwP] = p;
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const crTok = usage.cache_read_input_tokens ?? 0;
  const cwTok = usage.cache_creation_input_tokens ?? 0;
  return (inTok * inP + outTok * outP + crTok * crP + cwTok * cwP) / 1_000_000;
}

async function logUsage(opts: ChatOptions, result: ChatResult): Promise<void> {
  try {
    if (result.error) return;
    if (!result.usage) return;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    await admin.from("ai_usage_events").insert({
      user_id: opts.userId ?? null,
      task_key: opts.taskKey,
      provider: result.provider,
      model: result.model,
      input_tokens: result.usage.input_tokens ?? 0,
      output_tokens: result.usage.output_tokens ?? 0,
      cache_read_input_tokens: result.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens ?? 0,
      cost_usd: estimateCostUsd(result.model, result.usage),
    });
  } catch (e) {
    console.warn("[ai-dispatch] logUsage failed:", e);
  }
}

export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  const cfg = await getModelFor(opts.taskKey);
  const result = cfg.provider === "anthropic"
    ? await callAnthropic(cfg, opts)
    : await callGateway(cfg, opts);
  // Fire and forget — don't block caller on logging.
  logUsage(opts, result);
  return result;
}


// ── Gateway (OpenAI-compatible) ──────────────────────────────────────────────
async function callGateway(cfg: ModelConfig, opts: ChatOptions): Promise<ChatResult> {
  const KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!KEY) {
    return { content: "", provider: "gateway", model: cfg.model,
      error: { status: 500, message: "LOVABLE_API_KEY not configured" } };
  }
  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push(...opts.messages);

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { content: "", provider: "gateway", model: cfg.model,
      error: { status: res.status, message: txt.slice(0, 500) } };
  }
  const j = await res.json();
  return {
    content: j?.choices?.[0]?.message?.content ?? "",
    provider: "gateway",
    model: cfg.model,
    usage: {
      input_tokens: j?.usage?.prompt_tokens,
      output_tokens: j?.usage?.completion_tokens,
    },
  };
}

// ── Anthropic ────────────────────────────────────────────────────────────────
const DYNAMIC_MARKER = "\n\n<<<DYNAMIC_CONTEXT>>>\n\n";

async function callAnthropic(cfg: ModelConfig, opts: ChatOptions): Promise<ChatResult> {
  const KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!KEY) {
    return { content: "", provider: "anthropic", model: cfg.model,
      error: { status: 500, message: "ANTHROPIC_API_KEY not configured" } };
  }

  // Anthropic uses a separate `system` parameter; messages must alternate user/assistant.
  const messages = opts.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));
  if (messages.length === 0) {
    return { content: "", provider: "anthropic", model: cfg.model,
      error: { status: 400, message: "No user/assistant messages provided" } };
  }

  // Build system param (string or content-block array for caching)
  let systemParam: unknown;
  const headers: Record<string, string> = {
    "x-api-key": KEY,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  };

  if (opts.system) {
    if (opts.cacheSystem) {
      const idx = opts.system.indexOf(DYNAMIC_MARKER);
      const staticPart = idx >= 0 ? opts.system.slice(0, idx) : opts.system;
      const dynamicPart = idx >= 0 ? opts.system.slice(idx + DYNAMIC_MARKER.length) : "";
      const blocks: unknown[] = [
        { type: "text", text: staticPart, cache_control: { type: "ephemeral" } },
      ];
      if (dynamicPart) blocks.push({ type: "text", text: dynamicPart });
      systemParam = blocks;
      // Prompt caching beta header — Anthropic may promote this to GA;
      // sending it when GA is harmless. If a future API rejects it, drop the header.
      headers["anthropic-beta"] = "prompt-caching-2024-07-31";
    } else {
      systemParam = opts.system;
    }
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: opts.maxTokens ?? 2048,
      ...(systemParam ? { system: systemParam } : {}),
      messages,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { content: "", provider: "anthropic", model: cfg.model,
      error: { status: res.status, message: txt.slice(0, 500) } };
  }
  const j = await res.json();
  const content = Array.isArray(j?.content)
    ? j.content.filter((b: { type?: string }) => b?.type === "text")
        .map((b: { text?: string }) => b.text ?? "").join("")
    : "";
  return {
    content,
    provider: "anthropic",
    model: cfg.model,
    usage: {
      input_tokens: j?.usage?.input_tokens,
      output_tokens: j?.usage?.output_tokens,
      cache_read_input_tokens: j?.usage?.cache_read_input_tokens,
      cache_creation_input_tokens: j?.usage?.cache_creation_input_tokens,
    },
  };
}

// ── Anthropic Message Batches (nightly queue, 50% discount, 24h SLA) ─────────
// Lightweight wrappers — caller is responsible for storing returned batch IDs
// (e.g. on `optimizations.anthropic_batch_id`) and polling later.
export interface BatchItem {
  custom_id: string;
  model: string;
  max_tokens: number;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export async function submitAnthropicBatch(items: BatchItem[]): Promise<{ id: string; processing_status: string } | { error: string }> {
  const KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!KEY) return { error: "ANTHROPIC_API_KEY not configured" };
  const res = await fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST",
    headers: {
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "message-batches-2024-09-24",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: items.map((it) => ({
        custom_id: it.custom_id,
        params: {
          model: it.model,
          max_tokens: it.max_tokens,
          ...(it.system ? { system: it.system } : {}),
          messages: it.messages,
        },
      })),
    }),
  });
  if (!res.ok) return { error: `Batch submit ${res.status}: ${(await res.text()).slice(0, 300)}` };
  const j = await res.json();
  return { id: j.id, processing_status: j.processing_status };
}

export interface BatchStatus {
  id: string;
  processing_status: "in_progress" | "canceling" | "ended";
  results_url: string | null;
  request_counts?: { processing?: number; succeeded?: number; errored?: number; canceled?: number; expired?: number };
  ended_at?: string | null;
}

export async function pollAnthropicBatch(batchId: string): Promise<BatchStatus | { error: string }> {
  const KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!KEY) return { error: "ANTHROPIC_API_KEY not configured" };
  const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
    headers: {
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "message-batches-2024-09-24",
    },
  });
  if (!res.ok) return { error: `Batch poll ${res.status}: ${(await res.text()).slice(0, 300)}` };
  return await res.json() as BatchStatus;
}

export interface BatchResult {
  custom_id: string;
  result: {
    type: "succeeded" | "errored" | "canceled" | "expired";
    message?: { content?: Array<{ type: string; text?: string }>; usage?: Record<string, number> };
    error?: { type: string; message: string };
  };
}

/** Fetch and parse the JSONL results stream for an ended batch. */
export async function fetchAnthropicBatchResults(resultsUrl: string): Promise<BatchResult[]> {
  const KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch(resultsUrl, {
    headers: {
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "message-batches-2024-09-24",
    },
  });
  if (!res.ok) throw new Error(`Batch results ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as BatchResult);
}
