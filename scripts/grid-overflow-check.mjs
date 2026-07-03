// Isolated reproduction of the Dashboard.tsx "1fr_300px" grid overflow bug
// (bug #5, Echo's Insight panel) — verifies the min-w-0 fix at the CSS-grid
// level using the exact same structure (grid-cols-1 lg:grid-cols-[1fr_300px])
// and a content shape (a non-wrapping stat row) representative of what's
// actually in the Dashboard's left column. Can't screenshot the real
// authenticated Dashboard, so this proves the layout mechanics directly.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const url = 'file://' + path.join(here, 'grid-overflow-repro.html').replace(/\\/g, '/')

const browser = await chromium.launch()
// Width chosen just above the lg: 1024px breakpoint, where the two-column
// grid is active but narrower than the left column's non-wrapping content
// wants — this is exactly the resize range the bug report describes.
const page = await browser.newPage({ viewport: { width: 1100, height: 500 } })
await page.goto(url)

for (const useFix of [false, true]) {
  await page.evaluate((f) => window.__apply(f), useFix)
  await page.waitForTimeout(100)
  const overflow = await page.evaluate(() => {
    const de = document.documentElement
    const right = document.getElementById('rightcol').getBoundingClientRect()
    return {
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      rightColRight: Math.round(right.right),
      rightColVisible: right.right <= de.clientWidth && right.left >= 0,
    }
  })
  console.log(`${useFix ? 'AFTER (min-w-0)' : 'BEFORE (no min-w-0)'}: ` +
    `page overflow=${overflow.scrollW - overflow.clientW}px, ` +
    `right column right-edge=${overflow.rightColRight}px (viewport=${overflow.clientW}px), ` +
    `right column fully on-screen=${overflow.rightColVisible}`)
}

await browser.close()
