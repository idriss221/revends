import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5174'
const b = await chromium.launch({ headless: false })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('pageerror: ' + String(e)))

async function checkPage(url, name) {
  await p.goto(BASE + url, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)
  const data = await p.evaluate(() => ({
    title: document.title,
    theme: document.documentElement.dataset.theme,
    hasBureau: !!document.querySelector('html[data-bureau]'),
    header: !!document.querySelector('header.site'),
  }))
  await p.screenshot({ path: '/tmp/opencode/browser-' + name + '.png' })
  console.log(name.toUpperCase(), JSON.stringify(data))
  return data
}

const home = await checkPage('/', 'home')
const login = await checkPage('/#/login', 'login')
const shop = await checkPage('/#/shop', 'shop')
const sell = await checkPage('/#/sell', 'sell')
const sellReact = await checkPage('/vendre', 'sell-react')
const checkout = await checkPage('/#/checkout', 'checkout')
const favs = await checkPage('/#/favs', 'favs')
const account = await checkPage('/#/account', 'account')

const result = { home, login, shop, sell, sellReact, checkout, favs, account }
console.log('BROWSER_DONE', JSON.stringify(result))

await p.waitForTimeout(300000)
await b.close()