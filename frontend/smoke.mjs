import { chromium } from 'playwright'
import fs from 'node:fs'

const routes = ['/', '/market', '/trade', '/trade-founder', '/portfolio', '/profile', '/edit-profile', '/create', '/notification', '/help', '/nope-404']
const base = 'http://localhost:5173'

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror ${page.url()}: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console ${page.url()}: ${m.text()}`)
})

fs.mkdirSync('/tmp/justify-shots', { recursive: true })
for (const route of routes) {
  await page.goto(base + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const name = route === '/' ? 'feed' : route.replace(/\//g, '')
  await page.screenshot({ path: `/tmp/justify-shots/${name}.png`, fullPage: false })
  console.log(`${route} -> body text length: ${(await page.textContent('body'))?.trim().length}`)
}

// exercise interactions on the feed: tabs + market card flip + sign-in modal
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.click('button:has-text("Buy Barcelona")')
await page.waitForTimeout(600)
await page.screenshot({ path: '/tmp/justify-shots/feed-flipped.png' })
console.log('flip payout:', await page.textContent('.btn-payout'))
await page.click('ul.nav-pills button:has-text("People")')
await page.waitForTimeout(300)
await page.screenshot({ path: '/tmp/justify-shots/feed-people.png' })
await page.click('text=Sign In +')
await page.waitForTimeout(1500) // Dynamic's auth modal loads async
await page.screenshot({ path: '/tmp/justify-shots/signin-modal.png' })

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'NO CONSOLE/PAGE ERRORS')
await browser.close()
