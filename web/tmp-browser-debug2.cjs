const { chromium } = require('@playwright/test');

async function run() {
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  
  p.on('console', msg => consoleMsgs.push(`${msg.type()}: ${msg.text()}`));
  p.on('pageerror', err => pageErrors.push(err.message));

  const routes = [
    { url: '/#/cart', name: 'CART' },
    { url: '/#/checkout', name: 'CHECKOUT' },
    { url: '/#/login', name: 'LOGIN' },
    { url: '/#/account', name: 'ACCOUNT' },
  ];

  for (const route of routes) {
    console.log(`\n=== ${route.name} (${route.url}) ===`);
    await p.goto('http://localhost:5174' + route.url, { waitUntil: 'networkidle' });
    await new Promise(r => setTimeout(r, 5000));

    const data = await p.evaluate(function() {
      return {
        title: document.title,
        hasBureau: !!document.querySelector('html[data-bureau]'),
        header: !!document.querySelector('header.site'),
        footer: !!document.querySelector('footer.site'),
        bureauRoot: !!document.querySelector('.bureau-root'),
        appEl: document.getElementById('app') ? 'EXISTS' : 'MISSING',
        appInnerHTML: document.getElementById('app') ? document.getElementById('app').innerHTML.slice(0, 500) : 'NO APP',
        htmlAttrs: document.documentElement.outerHTML.slice(0, 200),
      };
    });

    console.log(route.name, JSON.stringify(data, null, 2));
  }

  console.log('\n=== CONSOLE ERRORS ===');
  consoleMsgs.filter(m => m.includes('error') || m.includes('Error') || m.includes('Warning')).forEach(m => console.log(m));
  console.log('\nPAGE ERRORS:', pageErrors);

  await new Promise(r => setTimeout(r, 300000));
  await b.close();
}

run().catch(console.error);