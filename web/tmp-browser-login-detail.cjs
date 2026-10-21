const { chromium } = require('@playwright/test');

async function run() {
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  
  p.on('console', msg => consoleMsgs.push(`${msg.type()}: ${msg.text()}`));
  p.on('pageerror', err => pageErrors.push(err.message));

  console.log('=== LOGIN PAGE DETAILED ===');
  await p.goto('http://localhost:5174/#/login', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 5000));

  const data = await p.evaluate(function() {
    // Check all form elements
    const allInputs = document.querySelectorAll('input');
    const allButtons = document.querySelectorAll('button');
    const allForms = document.querySelectorAll('form');
    const allLabels = document.querySelectorAll('label');
    
    return {
      title: document.title,
      hasBureau: !!document.querySelector('html[data-bureau]'),
      forms: document.querySelectorAll('form').length,
      inputs: Array.from(document.querySelectorAll('input')).map(el => ({
        name: el.name,
        type: el.type,
        visible: el.offsetParent !== null,
        className: el.className,
      }),
      buttons: Array.from(document.querySelectorAll('button')).map(el => ({
        type: el.type,
        text: el.textContent?.slice(0, 30),
        visible: el.offsetParent !== null,
        className: el.className,
      }),
      allElements: Array.from(document.querySelectorAll('*')).filter(el => el.className && el.className.includes('field') || el.className.includes('input') || el.className.includes('form')).map(el => ({
        tag: el.tagName,
        className: el.className,
        visible: el.offsetParent !== null,
      })),
    };
  });

  console.log('LOGIN FORM DETAILS:', JSON.stringify(data, null, 2));
  console.log('\nCONSOLE ERRORS:', consoleMsgs.filter(m => m.includes('error') || m.includes('Error')).slice(-10));
  console.log('PAGE ERRORS:', pageErrors);
}

run().catch(console.error);