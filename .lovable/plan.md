## PWA Infrastructure Plan

Pure infrastructure addition. No UI, routing, component, or Supabase logic changes.

### Files to create

**`public/manifest.json`**
- name: "RadarIQ", short_name: "RadarIQ"
- description: "Etsy seller analytics and optimization platform"
- start_url: "/", display: "standalone", orientation: "portrait-primary"
- background_color: "#0f172a", theme_color: "#14b8a6"
- icons: 192x192 and 512x512 entries. I'll scan `src/assets/` and `public/` for an existing logo; if none suitable, generate a simple teal placeholder PNG at both sizes and reference them from `/public`. You can swap these later.

**`public/sw.js`** — versioned cache `radariq-v1`
- `install`: precache app shell (`/`, `/index.html`). Note: hashed Vite JS/CSS filenames change every build, so the SW will cache them on first fetch via the runtime strategy below rather than by hardcoded path (hardcoding would 404 after every deploy).
- `activate`: delete old `radariq-*` caches, `clients.claim()`.
- `fetch` routing:
  - Supabase requests (host matches `*.supabase.co` or the project's Supabase URL) → **network-first**, fall back to cache only if offline.
  - Same-origin static assets (`/assets/*`, JS/CSS/images/fonts) → **cache-first**, populate on miss.
  - HTML navigations → **network-first** with cached `index.html` fallback (required so new deploys aren't shadowed by a stale shell).
  - Everything else → passthrough.
- Skips OAuth/auth callback paths (`/~oauth`, anything with `access_token`/`code` query) to avoid breaking Supabase auth redirects.

### Files to modify

**`index.html`** — add inside `<head>`:
- `<link rel="manifest" href="/manifest.json">`
- `<meta name="theme-color" content="#14b8a6">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<meta name="apple-mobile-web-app-title" content="RadarIQ">`
- `<link rel="apple-touch-icon" href="/icon-192.png">` (so iOS Add-to-Home-Screen uses the right icon)

**`src/main.tsx`** — append a guarded registration block (try/catch, never throws into the app):

```ts
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const h = location.hostname;
    const inIframe = window.self !== window.top;
    const isPreview =
      !import.meta.env.PROD ||
      inIframe ||
      h.startsWith('id-preview--') ||
      h.startsWith('preview--') ||
      h.endsWith('.lovableproject.com') ||
      h.endsWith('.lovableproject-dev.com') ||
      h.endsWith('.beta.lovable.dev') ||
      new URLSearchParams(location.search).has('sw=off');

    if (isPreview) {
      // Ensure no stale SW in preview/dev
      navigator.serviceWorker.getRegistrations()
        .then(rs => rs.forEach(r => { if (r.active?.scriptURL.endsWith('/sw.js')) r.unregister(); }))
        .catch(() => {});
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
```

### Why the preview guard is non-negotiable

Service workers persist in the browser and will serve stale HTML/JS in the Lovable editor preview, causing white screens and "my changes aren't showing up" bugs across every future session. The guard registers the SW only on the published domain (`radariq.app`, `radariq-app.lovable.app`), and provides `?sw=off` as a kill switch. This is the only deviation from a literal reading of your spec — everything else matches exactly.

### Out of scope (explicitly not touched)

- No component, page, route, hook, context, or Supabase client changes
- No `vite.config.ts` plugin additions
- No new dependencies

### Verification after build

- `public/manifest.json`, `public/sw.js`, `public/icon-192.png`, `public/icon-512.png` exist
- `index.html` contains the 5 new head tags
- `src/main.tsx` diff is additive only
- Confirm no other files changed
