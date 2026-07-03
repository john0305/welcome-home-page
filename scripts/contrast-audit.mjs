// Pure-Node WCAG contrast audit of the RadarIQ token palette.
// No browser needed — computes exact ratios from HSL/hex values in index.css.

function hslToRgb(h, s, l) {
  s /= 100; l /= 100
  const k = n => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255))
}
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function lum([r, g, b]) {
  const a = [r, g, b].map(v => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
}
function ratio(c1, c2) {
  const l1 = lum(c1), l2 = lum(c2)
  return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))
}
const rgb = v => v.startsWith('#') ? hexToRgb(v) : hslToRgb(...v.split(' ').map(parseFloat))
const AA_TEXT = 4.5, AA_LARGE = 3.0

// Light-mode tokens (from index.css)
const bg = '36 33% 97%'          // page
const surface1 = '0 0% 100%'     // cards
const surface2 = '30 20% 95%'
const fg = '20 10% 11%'
const muted = '25 8% 47%'        // muted-foreground
const primary = '163 55% 28%'    // forest (default color-theme)

const pairs = [
  ['foreground on page bg', fg, bg, AA_TEXT],
  ['foreground on card', fg, surface1, AA_TEXT],
  ['muted-foreground on page bg', muted, bg, AA_TEXT],
  ['muted-foreground on card', muted, surface1, AA_TEXT],
  ['muted-foreground on surface-2', muted, surface2, AA_TEXT],
  ['primary text on page bg', primary, bg, AA_TEXT],
  ['primary text on card', primary, surface1, AA_TEXT],
  ['white on primary (button)', '0 0% 100%', primary, AA_TEXT],
]

// Grade badge text/bg pairs — current (Tailwind -400 text on -500/15 tint over white card)
// Tailwind refs: emerald-400 #34d399, green-400 #4ade80, amber-400 #fbbf24,
// orange-400 #fb923c, red-400 #f87171, primary teal.
const white = [255, 255, 255]
const tint = (hex, pct) => { const c = hexToRgb(hex); return c.map(v => Math.round(v * pct + 255 * (1 - pct))) }
const gradeCurrent = [
  ['grade-aplus text-emerald-400 on 15% tint', '#34d399', null, AA_TEXT, tint('#10b981', 0.15)],
  ['grade-a text-green-400 on 15% tint', '#4ade80', null, AA_TEXT, tint('#22c55e', 0.15)],
  ['grade-c text-amber-400 on 15% tint', '#fbbf24', null, AA_TEXT, tint('#f59e0b', 0.15)],
  ['grade-d text-orange-400 on 15% tint', '#fb923c', null, AA_TEXT, tint('#f97316', 0.15)],
  ['grade-f text-red-400 on 15% tint', '#f87171', null, AA_TEXT, tint('#ef4444', 0.15)],
]

function run(label, rows) {
  console.log(`\n── ${label} ──`)
  for (const [name, fgv, bgv, min, bgOverride] of rows) {
    const c1 = rgb(fgv)
    const c2 = bgOverride || rgb(bgv)
    const r = ratio(c1, c2)
    const pass = r >= min
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  (need ${min})  ${name}`)
  }
}
run('Core text pairs (light mode)', pairs)
run('Grade badges — CURRENT (-400 text)', gradeCurrent)

// ── NEW grade palette (this pass) — text on -50 bg over white card ──
// Tailwind: emerald-700 #047857, emerald-600 #059669, amber-800 #92400e,
// orange-700 #c2410c, orange-800 #9a3412; -50 bgs are near-white tints.
// bg-primary/10 = forest teal at 10% over white.
const em50 = hexToRgb('#ecfdf5'), am50 = hexToRgb('#fffbeb'), or50 = hexToRgb('#fff7ed')
const primary10 = [255,255,255].map((w,i)=>Math.round(hslToRgb(163,55,28)[i]*0.10 + w*0.90))
const gradeNew = [
  ['grade-aplus emerald-700 / emerald-50', hexToRgb('#047857'), em50],
  ['grade-a emerald-700 / emerald-50', hexToRgb('#047857'), em50],
  ['grade-b primary / primary-10', hslToRgb(163,55,28), primary10],
  ['grade-c amber-800 / amber-50', hexToRgb('#92400e'), am50],
  ['grade-d orange-700 / orange-50', hexToRgb('#c2410c'), or50],
  ['grade-f orange-800 / orange-50', hexToRgb('#9a3412'), or50],
]
console.log('\n── Grade badges — NEW (this pass) ──')
for (const [name, c1, c2] of gradeNew) {
  const r = ratio(c1, c2)
  console.log(`  ${r>=4.5?'PASS':'FAIL'}  ${r.toFixed(2)}:1  (need 4.5)  ${name}`)
}
// New muted-foreground 25 10% 40%
const mutedNew = hslToRgb(25,10,40)
console.log('\n── muted-foreground NEW (25 10% 40%) ──')
for (const [n,b] of [['page bg','36 33% 97%'],['card','0 0% 100%'],['surface-2','30 20% 95%']]) {
  const r = ratio(mutedNew, hslToRgb(...b.split(' ').map(parseFloat)))
  console.log(`  ${r>=4.5?'PASS':'FAIL'}  ${r.toFixed(2)}:1  muted on ${n}`)
}
