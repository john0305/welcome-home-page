You're working on RadarIQ, an Etsy seller optimization platform. I'm attaching two documents:

1. **RadarIQ_Fable5_Brief.md** — the full scope for this pass: what to fix, what to build, design direction, tier strategy, and success criteria.
2. **ARCHITECTURE.md** — an accurate, current map of the existing codebase (stack, data flow, schema, auth, known issues). Treat this as ground truth for what already exists; the brief is written to build on top of it, not replace it.

Read both fully before starting. Then:

- Follow the build sequence in the brief's "Suggested Build Sequence" section — order matters, later work depends on earlier fixes being solid.
- Where the brief says a feature already exists (niche detection, outcome tracking, theme personalization, Pinterest Spotlight, photo analysis, etc.), audit and extend the real implementation named in ARCHITECTURE.md — don't build a parallel version.
- Maintain the living architecture document as you go — update ARCHITECTURE.md itself (or a clearly linked companion file) as you complete each major piece, so it stays accurate for future work, not just a snapshot of today.
- Self-check your work against the "Success Criteria" section before considering any part of this done.
- If you hit a genuine ambiguity the brief doesn't resolve, make a reasonable call and document your reasoning in the architecture doc rather than stalling — but flag anything high-stakes or hard to reverse for review.
- At the end, give me: what was fixed, what was built, the final tier-gating decisions with reasoning, and a ranked list of anything you'd recommend but didn't build in this pass.
- **Also at the end, produce a separate, standalone Lovable handoff prompt** (per Section 16, item 7 of the brief). Lovable manages Supabase for this project directly — there's no separate API access outside Lovable's interface — so anything you build or change that touches schema, edge functions, auth/session handling, the Echo AI chat, environment variables/secrets, or cron scheduling needs to be summarized as a prompt Lovable can act on directly, not just noted in your own summary.
- **Where you have to make a judgment call the brief doesn't fully resolve**, don't stall — decide using this priority order: (1) whatever is fairest and safest for the user/seller, even over short-term performance, (2) among options that are equally fair and safe, whichever best serves the company's interests (conversion, retention, differentiation). Document the reasoning for any non-trivial call in the architecture doc.

Go ahead and start with the security/stability fixes named in Section 2, then proceed through the sequence.
