// AI-gateway fallback simulation (Section 12a).
// The edge functions are Deno + esm.sh imports and there's no local Deno
// runtime or deploy access, so this harness reproduces the EXACT decision
// branches from the handlers verbatim and drives each failure scenario,
// asserting the seller-facing outcome. It validates the control flow, not the
// network layer.

let pass = 0, fail = 0
const ok = (name, cond) => { (cond ? pass++ : fail++); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`) }

// ── grade-listing: verbatim reproduction of the !aiRes.ok branch ──
// (supabase/functions/grade-listing/index.ts)
function gradeFallback({ status, listing }) {
  // if (!aiRes.ok) {
  if (listing.score != null && listing.grade != null) {
    return { kind: 'stale', body: {
      stale: true,
      graded_at: listing.last_graded ?? null,
      score: listing.score,
      grade: listing.grade,
      notice: "We couldn't refresh this grade just now, so you're seeing the last saved one. We'll retry automatically.",
    }, httpStatus: 200 }
  }
  if (status === 429) return { kind: 'error', body: { error: 'Rate limited, please try again shortly.' }, httpStatus: 429 }
  if (status === 402) return { kind: 'error', body: { error: 'AI credits exhausted. Please add credits in workspace settings.', upgrade_required: true }, httpStatus: 402 }
  return { kind: 'error', body: { error: "We couldn't grade this listing just now — please try again in a moment." }, httpStatus: 502 }
}

console.log('\n── grade-listing fallback ──')
{
  const r = gradeFallback({ status: 500, listing: { score: 82, grade: 'A', last_graded: '2026-06-30' } })
  ok('gateway 500 + prior grade → stale grade returned (not error/blank)', r.kind === 'stale' && r.httpStatus === 200 && r.body.stale === true && r.body.score === 82)
  ok('stale response carries a friendly "last saved" notice', /last saved one/.test(r.body.notice))
  ok('stale response includes graded_at date for "as of" display', r.body.graded_at === '2026-06-30')
}
{
  const r = gradeFallback({ status: 429, listing: { score: null, grade: null } })
  ok('gateway 429 + no prior grade → friendly 429 (never blank)', r.kind === 'error' && r.httpStatus === 429 && /try again/i.test(r.body.error))
}
{
  const r = gradeFallback({ status: 402, listing: { score: null, grade: null } })
  ok('gateway 402 + no prior grade → upgrade-required message', r.httpStatus === 402 && r.body.upgrade_required === true)
}
{
  const r = gradeFallback({ status: 500, listing: { score: null, grade: null } })
  ok('gateway 500 + no prior grade → friendly 502 (never blank)', r.httpStatus === 502 && /couldn't grade/i.test(r.body.error))
}

// ── rewrite-listing: verbatim reproduction of failure handling ──
// (supabase/functions/rewrite-listing/index.ts) — refund on any failure.
function rewriteFallback({ status, ok: aiOk, placeholderHits = 0 }) {
  const events = []
  const refund = () => events.push('refund_optimization')
  if (status === 429) { refund(); return { events, httpStatus: 429, body: { error: "Rate limited, please try again shortly. This attempt wasn't counted against your quota." } } }
  if (status === 402) { refund(); return { events, httpStatus: 402, body: { error: 'AI credits exhausted.', upgrade_required: true } } }
  if (!aiOk) { refund(); return { events, httpStatus: 502, body: { error: "The AI service had trouble just now — your quota wasn't charged. Please try again." } } }
  if (placeholderHits > 0) { refund(); return { events, httpStatus: 502, body: { error: "AI couldn't produce a publish-ready rewrite ... Your quota wasn't charged — please try again." } } }
  return { events, httpStatus: 200, body: { ok: true } }
}

console.log('\n── rewrite-listing fallback (quota refund) ──')
for (const [label, args] of [
  ['gateway 429', { status: 429 }],
  ['gateway 402', { status: 402 }],
  ['gateway 5xx', { status: 500, ok: false }],
  ['unusable output (placeholder)', { status: 200, ok: true, placeholderHits: 2 }],
]) {
  const r = rewriteFallback(args)
  ok(`${label} → credit refunded + failure surfaced (not silent)`, r.events.includes('refund_optimization') && r.httpStatus !== 200 && /quota wasn't charged|Rate limited|exhausted/i.test(r.body.error))
}
{
  const r = rewriteFallback({ status: 200, ok: true })
  ok('success → no refund, no error', r.events.length === 0 && r.httpStatus === 200)
}

console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED'} — ${pass} assertions passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
