const { chromium } = require('@playwright/test');

async function run() {
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  
  p.on('console', msg => consoleMsgs.push(`${msg.type()}: ${msg.text()}`));
  p.on('pageerror', err => pageErrors.push(err.message));

  await p.goto('http://localhost:5174/#/sell', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 5000));

  const data = await p.evaluate(function() {
    return {
      title: document.title,
      hasBureau: !!document.querySelector('html[data-bureau]'),
      header: !!document.querySelector('header.site'),
      footer: !!document.querySelector('footer.site'),
      sprite: !!document.querySelector('svg.symbol-sprite'),
      bureauRoot: !!document.querySelector('.bureau-root'),
      headerUserMenu: !!document.querySelector('.header-user-menu, [class*="header-user"]'),
      sellWizard: document.querySelector('[class*="sell-wizard"], [class*="sell-step"]') !== null,
      appEl: document.getElementById('app') ? 'EXISTS' : 'MISSING',
      appInnerHTML: document.getElementById('app') ? document.getElementById('app').innerHTML.slice(0, 500) : 'NO APP',
      htmlAttrs: document.documentElement.outerHTML.slice(0, 200),
      reactRoot: document.querySelector('#root') ? 'EXISTS' : 'MISSING',
    };
  });

  console.log('=== SELL PAGE DATA ===');
  console.log(JSON.stringify({ pageData: data, console: consoleMsgs.slice(-20), errors: pageErrors }, null, 2));
}

run().catch(console.error);