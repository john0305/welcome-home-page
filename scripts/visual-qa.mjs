import { chromium, devices } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.QA_BASE || 'http://localhost:5174'
const OUT = 'scripts/qa-shots'
mkdirSync(OUT, { recursive: true })

const routes = (process.env.QA_ROUTES || '/').split(',')

const browser = await chromium.launch()
for (const route of routes) {
  const slug = route.replace(/[^a-z0-9]+/gi, '_') || 'root'

  // Desktop
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const dp = await desk.newPage()
  await dp.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
  await dp.waitForTimeout(1200)
  await dp.screenshot({ path: `${OUT}/${slug}_desktop.png`, fullPage: true })
  let axe = null
  try {
    axe = await new AxeBuilder({ page: dp }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  } catch (e) { axe = { error: String(e) } }
  const serious = (axe.violations || []).filter(v => v.impact === 'serious' || v.impact === 'critical')
  console.log(`\n=== ${route} ===`)
  console.log(`desktop axe: ${(axe.violations||[]).length} violations, ${serious.length} serious/critical`)
  for (const v of serious.slice(0, 12)) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
    const n = v.nodes[0]
    if (n) console.log(`      e.g. ${(n.target||[]).join(' ')} — ${(n.failureSummary||'').replace(/\n/g,' ').slice(0,140)}`)
  }
  await desk.close()

  // Mobile (iPhone 13)
  const mob = await browser.newContext({ ...devices['iPhone 13'] })
  const mp = await mob.newPage()
  await mp.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
  await mp.waitForTimeout(1200)
  await mp.screenshot({ path: `${OUT}/${slug}_mobile.png`, fullPage: true })
  // horizontal overflow check
  const overflow = await mp.evaluate(() => {
    const de = document.documentElement
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, overflow: de.scrollWidth - de.clientWidth }
  })
  console.log(`mobile: viewport overflow = ${overflow.overflow}px (scrollW ${overflow.scrollW} vs clientW ${overflow.clientW})`)
  await mob.close()
}
await browser.close()
console.log('\nshots written to', OUT)
