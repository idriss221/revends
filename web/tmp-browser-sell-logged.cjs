const { chromium } = require('@playwright/test');

async function run() {
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  
  p.on('console', msg => consoleMsgs.push(`${msg.type()}: ${msg.text()}`));
  p.on('pageerror', err => pageErrors.push(err.message));

  // 1. Login first
  console.log('=== LOGIN ===');
  await p.goto('http://localhost:5174/#/login', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 3000));
  
  await p.fill('input[name="identifier"]', 'admin@revends.com');
  await p.fill('input[name="password"]', 'DevopsChangeMe123');
  await p.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 3000));

  // Check login success
  const loginData = await p.evaluate(() => ({
    userLogged: !!document.querySelector('[class*="header-user"]'),
    hash: window.location.hash,
    url: window.location.href,
  }));
  console.log('LOGIN RESULT:', JSON.stringify(loginData));

  // 2. Navigate to #/sell
  console.log('\n=== NAVIGATE TO #/SELL ===');
  await p.goto('http://localhost:5174/#/sell', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 5000));

  const data = await p.evaluate(function() {
    return {
      title: document.title,
      hasBureau: !!document.querySelector('html[data-bureau]'),
      header: !!document.querySelector('header.site'),
      footer: !!document.querySelector('footer.site'),
      bureauRoot: !!document.querySelector('.bureau-root'),
      appEl: document.getElementById('app') ? 'EXISTS' : 'MISSING',
      appInnerHTML: document.getElementById('app') ? document.getElementById('app').innerHTML.slice(0, 1500) : 'NO APP',
      sellWizard: !!document.querySelector('[class*="sell"]'),
      stepper: !!document.querySelector('[role="list"] ol'),
      step1: !!document.querySelector('select[name="categoryId"]'),
      allComponents: Array.from(document.querySelectorAll('[class*="sell"], [class*="step"], [class*="wizard"]')).map(el => el.className),
    };
  });

  console.log('SELL PAGE DATA:', JSON.stringify(data, null, 2));

  console.log('\nCONSOLE ERRORS:', consoleMsgs.filter(m => m.includes('error') || m.includes('Error')).slice(-20));
  console.log('PAGE ERRORS:', pageErrors);
}

run().catch(console.error);