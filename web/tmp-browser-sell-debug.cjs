const { chromium } = require('@playwright/test');

async function run() {
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  
  p.on('console', msg => consoleMsgs.push(`${msg.type()}: ${msg.text()}`));
  p.on('pageerror', err => pageErrors.push(err.message));

  console.log('=== NAVIGATE TO #/SELL ===');
  await p.goto('http://localhost:5174/#/sell', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 5000));

  const data = await p.evaluate(function() {
    const app = document.getElementById('app');
    const sellWizard = document.querySelector('[class*="sell"]');
    const stepper = document.querySelector('[role="list"] ol');
    const step1 = document.querySelector('select[name="categoryId"]');
    const portal = document.querySelector('[data-portal], [class*="portal"]');
    
    return {
      title: document.title,
      hasBureau: !!document.querySelector('html[data-bureau]'),
      header: !!document.querySelector('header.site'),
      footer: !!document.querySelector('footer.site'),
      bureauRoot: !!document.querySelector('.bureau-root'),
      appEl: document.getElementById('app') ? 'EXISTS' : 'MISSING',
      appInnerHTML: document.getElementById('app') ? document.getElementById('app').innerHTML.slice(0, 1000) : 'NO APP',
      sellWizardClasses: Array.from(document.querySelectorAll('[class*="sell"]')).map(el => el.className),
      stepper: !!document.querySelector('[role="list"] ol'),
      step1: !!document.querySelector('select[name="categoryId"]'),
      portal: document.querySelector('[data-portal], [class*="portal"]') ? 'EXISTS' : 'MISSING',
      allComponents: Array.from(document.querySelectorAll('[class*="sell"], [class*="step"], [class*="wizard"]')).map(el => el.className),
    };
  });

  console.log('SELL PAGE DATA:', JSON.stringify(data, null, 2));
  console.log('\nCONSOLE:', consoleMsgs.filter(m => m.includes('error') || m.includes('Error') || m.includes('Warning')).slice(-20));
  console.log('PAGE ERRORS:', pageErrors);
}

run().catch(console.error);