const { chromium } = require('@playwright/test');

async function run() {
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  await p.goto('http://localhost:5174/#/sell', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 3000));

  const data = await p.evaluate(function() {
    return {
      title: document.title,
      hasBureau: !!document.querySelector('html[data-bureau]'),
      header: !!document.querySelector('header.site'),
      footer: !!document.querySelector('footer.site'),
      sprite: !!document.querySelector('svg.symbol-sprite'),
      stepper: !!document.querySelector('[role="list"] ol'),
      step1: !!document.querySelector('select[name="categoryId"]'),
      appHTML: document.getElementById('app') ? document.getElementById('app').innerHTML.slice(0, 300) : 'NO APP',
    };
  });

  console.log('SELL_FIXED', JSON.stringify(data));

  await new Promise(r => setTimeout(r, 300000));
  await b.close();
}

run().catch(console.error);