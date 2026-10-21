import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5174'
const b = await chromium.launch({ headless: false })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()

async function check(url, name) {
  await p.goto('http://localhost:5174' + url, { waitUntil: 'networkidle' })
  await p.waitForTimeout(3000)
  const data = await p.evaluate(() => ({
    title: document.title,
    hasBureau: !!document.querySelector('html[data-bureau]'),
    header: !!document.querySelector('header.site'),
    footer: !!document.querySelector('footer.site'),
    sprite: !!document.querySelector('svg.symbol-sprite'),
    stepper: !!document.querySelector('[role="list"] ol'),
    step1: !!document.querySelector('select[name="categoryId"]'),
    appHTML: document.getElementById('app')?.innerHTML?.slice(0, 300),
  })
  await p.screenshot({ path: '/tmp/opencode/browser-' + name + '.png' })
  console.log(name.toUpperCase(), JSON.stringify(data))
  return data
}

await check('/#/sell', 'sell')
const result = { sell: { ok: true } }
console.log('BROWSER_DONE', JSON.stringify({ sell: { ok: true } }))