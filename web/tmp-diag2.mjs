import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 900 } })
const bad = []
p.on('response', r => { if (r.status() >= 400) errs.push?.(); })
p.on('response', r => { const s=r.status(); if (s>=400 && s!==401) console.log(s, r.url()) })
await p.goto('http://localhost:8080/', { waitUntil: 'networkidle' })
await p.waitForTimeout(1000)
await p.evaluate(()=>{ location.hash='#/login' })
await p.waitForTimeout(1500)
await p.evaluate(()=>{ location.hash='#/shop' })
await p.waitForTimeout(1500)
await b.close()
