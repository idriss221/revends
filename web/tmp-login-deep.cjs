const { chromium } = require('@playwright/test');

async function run() {
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  
  p.on('console', msg => consoleMsgs.push(`${msg.type()}: ${msg.text()}`));
  p.on('pageerror', err => pageErrors.push(err.message));

  await p.goto('http://localhost:5174/#/login', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 5000));

  const data = await p.evaluate(function() {
    const form = document.querySelector('form');
    const allElements = document.querySelectorAll('*');
    
    return {
      formHTML: form ? form.outerHTML.slice(0, 3000) : 'NO FORM',
      allInputs: Array.from(document.querySelectorAll('input')).map(el => ({
        name: el.name,
        type: el.type,
        id: el.id,
        className: el.className,
        visible: el.offsetParent !== null,
      })),
      allButtons: Array.from(document.querySelectorAll('button')).map(el => ({
        type: el.type,
        text: el.textContent?.slice(0, 30),
        className: el.className,
      }),
      allElementsWithClass: Array.from(document.querySelectorAll('[class]')).filter(el => 
        el.className.includes('field') || el.className.includes('input') || el.className.includes('form') || el.className.includes('button')
      ).map(el => ({
        tag: el.tagName,
        className: el.className,
        visible: el.offsetParent !== null,
      })),
    };
  });

  console.log('LOGIN FORM HTML:', JSON.stringify(data, null, 2));
  console.log('\nCONSOLE ERRORS:', consoleMsgs.filter(m => m.includes('error') || m.includes('Error')).slice(-10));
  console.log('PAGE ERRORS:', pageErrors);
}

run().catch(console.error);